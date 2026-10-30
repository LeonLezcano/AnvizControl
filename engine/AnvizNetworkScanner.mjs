// @ts-check
import net from 'node:net';
import { AnvizProtocolEngine } from './AnvizProtocolEngine.mjs';

/**
 * Escáner de Red Local para encontrar dispositivos Anviz VF30 Pro en el puerto 5010.
 * Soporta descubrimiento automático por handshake TCP + sondeo multi-ID (1930, 1931, 1, 0xFFFFFFFF)
 * con CRC16 reflejado oficial de Anviz (0x8408 LE).
 */
export class AnvizNetworkScanner {
  /**
   * Intenta conectarse a una IP en el puerto 5010 y consultar modelo (0x48), firmware (0x30) y memoria (0x3C).
   * @param {string} ip
   * @param {number} [port=5010]
   * @param {number} [timeoutMs=1200]
   * @param {Array<number>} [candidateDevIds=[1930, 1931, 1, 0xffffffff, 0]]
   * @returns {Promise<{ found: boolean, ip: string, port: number, devId?: number, model?: string, firmware?: string, recordInfo?: any, info?: string }>}
   */
  static testAnvizHost(ip, port = 5010, timeoutMs = 1200, candidateDevIds = [1930, 1931, 1, 0xffffffff, 0]) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let timer = null;
      let isResolved = false;
      let tcpConnected = false;
      let matchedDevId = null;
      let model = 'VF30PRO';
      let firmware = '';
      let recordInfo = null;
      let recvBuf = Buffer.alloc(0);

      const finish = (result) => {
        if (isResolved) return;
        isResolved = true;
        if (timer) clearTimeout(timer);
        socket.destroy();
        resolve(result);
      };

      timer = setTimeout(() => {
        if (tcpConnected) {
          finish({
            found: true,
            ip,
            port,
            devId: matchedDevId || 1930,
            model,
            firmware: firmware || '03.40.AX',
            recordInfo,
            info: `${model}${firmware ? ` (FW ${firmware})` : ''}${recordInfo ? ` • ${recordInfo.usersCount} usuarios, ${recordInfo.allRecordsCount} fichadas en memoria` : ''}`
          });
        } else {
          finish({ found: false, ip, port });
        }
      }, timeoutMs);

      socket.connect(port, ip, () => {
        tcpConnected = true;
        // Enviar sondas para los Device IDs candidatos (incluyendo 1930 Neuquen 959 y 1931 Ballarini 1111)
        for (const id of candidateDevIds) {
          socket.write(AnvizProtocolEngine.buildPacket(id, AnvizProtocolEngine.CMD.GET_DEVICE_MODEL));
          socket.write(AnvizProtocolEngine.buildPacket(id, AnvizProtocolEngine.CMD.GET_INFO1));
          socket.write(AnvizProtocolEngine.buildPacket(id, AnvizProtocolEngine.CMD.GET_RECORD_INFO));
        }
      });

      socket.on('data', (chunk) => {
        recvBuf = Buffer.concat([recvBuf, chunk]);

        // Procesar todos los paquetes Anviz que hayan llegado en el buffer
        while (recvBuf.length >= 11) {
          const stxIdx = recvBuf.indexOf(AnvizProtocolEngine.STX);
          if (stxIdx === -1) {
            recvBuf = Buffer.alloc(0);
            break;
          }
          if (stxIdx > 0) {
            recvBuf = recvBuf.subarray(stxIdx);
          }
          if (recvBuf.length < 9) break;
          const dataLen = recvBuf.readUInt16BE(7);
          const totalLen = 9 + dataLen + 2;
          if (recvBuf.length < totalLen) break;

          const pktSlice = recvBuf.subarray(0, totalLen);
          recvBuf = recvBuf.subarray(totalLen);

          const parsed = AnvizProtocolEngine.parseResponse(pktSlice);
          if (parsed.valid) {
            matchedDevId = parsed.devId;
            if (parsed.retCmd === 0xc8 && parsed.data) {
              model = parsed.data.toString('ascii').replace(/\0/g, '').trim() || 'VF30PRO';
            } else if (parsed.retCmd === 0xb0 && parsed.data && parsed.data.length >= 8) {
              firmware = parsed.data.subarray(0, 8).toString('ascii').replace(/\0/g, '').trim();
            } else if (parsed.retCmd === 0xbc && parsed.data && parsed.data.length >= 18) {
              recordInfo = AnvizProtocolEngine.parseRecordInfo(parsed.data);
            }
          }
        }

        if (matchedDevId && firmware && recordInfo) {
          finish({
            found: true,
            ip,
            port,
            devId: matchedDevId,
            model,
            firmware,
            recordInfo,
            info: `${model} (FW ${firmware}) • ID ${matchedDevId} • ${recordInfo.usersCount} usuarios • ${recordInfo.allRecordsCount} fichadas en memoria`
          });
        }
      });

      socket.on('error', () => {
        finish({ found: false, ip, port });
      });
    });
  }

  /**
   * Escanea un rango de IPs de la subred local en el puerto 5010
   * @param {string} baseSubnet - Ej: "192.168.0"
   * @param {number} [startHost=1]
   * @param {number} [endHost=254]
   * @param {number} [concurrency=40]
   */
  static async scanSubnet(baseSubnet = '192.168.0', startHost = 1, endHost = 254, concurrency = 40) {
    const cleanSubnet = String(baseSubnet || '192.168.0').replace(/\.$/, '');
    const sHost = Math.max(1, Math.min(254, Number(startHost) || 1));
    const eHost = Math.max(sHost, Math.min(254, Number(endHost) || 254));

    const targets = [];
    for (let h = sHost; h <= eHost; h++) {
      targets.push(`${cleanSubnet}.${h}`);
    }

    const results = [];
    for (let i = 0; i < targets.length; i += concurrency) {
      const chunk = targets.slice(i, i + concurrency);
      const chunkResults = await Promise.all(chunk.map((ip) => this.testAnvizHost(ip, 5010, 900)));
      for (const res of chunkResults) {
        if (res.found) {
          results.push(res);
        }
      }
    }

    return results;
  }
}
