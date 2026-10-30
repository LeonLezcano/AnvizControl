// @ts-check
import net from 'node:net';
import { AnvizProtocolEngine } from './AnvizProtocolEngine.mjs';

/**
 * Escáner de Red Local para encontrar dispositivos Anviz en el puerto 5010
 */
export class AnvizNetworkScanner {
  /**
   * Intenta conectarse a una IP en el puerto 5010 y consultar GET_INFO1
   * @param {string} ip
   * @param {number} [port=5010]
   * @param {number} [timeoutMs=800]
   * @returns {Promise<{ found: boolean, ip: string, port: number, devId?: number, info?: string }>}
   */
  static testAnvizHost(ip, port = 5010, timeoutMs = 800) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let timer = null;
      let isResolved = false;

      const finish = (result) => {
        if (isResolved) return;
        isResolved = true;
        if (timer) clearTimeout(timer);
        socket.destroy();
        resolve(result);
      };

      timer = setTimeout(() => {
        finish({ found: false, ip, port });
      }, timeoutMs);

      socket.connect(port, ip, () => {
        // Enviar consulta GET_INFO1 (cmd 0x30)
        const req = AnvizProtocolEngine.buildPacket(1, AnvizProtocolEngine.CMD.GET_INFO1);
        socket.write(req);
      });

      socket.on('data', (data) => {
        const resp = AnvizProtocolEngine.parseResponse(data);
        if (resp.valid) {
          finish({
            found: true,
            ip,
            port,
            devId: resp.devId,
            info: resp.data ? resp.data.toString('ascii').replace(/\0/g, '').trim() : 'Anviz Device'
          });
        } else {
          // Si respondió datos en el puerto 5010 pero el formato difiere levemente
          finish({
            found: true,
            ip,
            port,
            info: 'Puerto 5010 abierto (dispositivo detectado)'
          });
        }
      });

      socket.on('error', () => {
        finish({ found: false, ip, port });
      });
    });
  }

  /**
   * Escanea una lista de IPs o un rango CIDR local
   * @param {string} baseSubnet - Ej: "192.168.0"
   * @param {number} [startHost=1]
   * @param {number} [endHost=254]
   * @param {number} [concurrency=30]
   * @returns {Promise<Array<{ ip: string, port: number, found: boolean, info?: string }>>}
   */
  static async scanSubnet(baseSubnet = '192.168.0', startHost = 1, endHost = 254, concurrency = 25) {
    const targets = [];
    for (let h = startHost; h <= endHost; h++) {
      targets.push(`${baseSubnet}.${h}`);
    }

    const results = [];
    for (let i = 0; i < targets.length; i += concurrency) {
      const chunk = targets.slice(i, i + concurrency);
      const chunkPromises = chunk.map((ip) => this.testAnvizHost(ip));
      const chunkResults = await Promise.all(chunkPromises);
      for (const res of chunkResults) {
        if (res.found) {
          results.push(res);
        }
      }
    }

    return results;
  }
}
