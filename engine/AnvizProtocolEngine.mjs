// @ts-check
/**
 * Anviz Protocol Engine (TC_B / CrossChex Binary Protocol)
 * Soporta comunicación TCP directa en puerto 5010 y decodificación de tramas Anviz VF30 Pro.
 * CRC16: CRC-16/MCRF4XX (Polinomio reflejado 0x8408, Init 0xFFFF, Little-Endian en los últimos 2 bytes).
 */

export class AnvizProtocolEngine {
  static STX = 0xa5;
  static DEFAULT_PORT = 5010;

  // Comandos oficiales Anviz VF30 Pro / TC_B
  static CMD = {
    GET_INFO1: 0x30,
    SET_INFO1: 0x31,
    GET_INFO2: 0x32,
    SET_INFO2: 0x33,
    GET_DATETIME: 0x38,
    SET_DATETIME: 0x39,
    GET_NET_INFO: 0x3a,
    SET_NET_INFO: 0x3b,
    GET_RECORD_INFO: 0x3c,
    GET_RECORDS: 0x40,
    GET_DEVICE_SN: 0x24,
    GET_DEVICE_MODEL: 0x48,
    CLEAR_RECORDS: 0x4e,
    GET_STAFF_INFO: 0x72,
    SET_STAFF_INFO: 0x73,
    DELETE_STAFF: 0x4c
  };

  /**
   * Calcula el CRC16 oficial de Anviz (Polinomio reflejado 0x8408, Init 0xFFFF).
   * Verificado contra capturas reales del VF30 Pro:
   * - A5 00 00 00 01 3C 00 00 -> CRC LE: 49 A9 (0xA949)
   * - A5 00 00 00 01 48 00 00 -> CRC LE: F0 4A (0x4AF0)
   * - A5 00 00 00 01 30 00 00 -> CRC LE: EA 0C (0x0CEA)
   * @param {Buffer|Uint8Array} buf
   * @returns {number} Entero de 16 bits (para escribir en Little-Endian con writeUInt16LE)
   */
  static calcCRC16(buf) {
    if (!buf || typeof buf.length !== 'number') return 0xffff;
    let crc = 0xffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let bit = 0; bit < 8; bit++) {
        if (crc & 0x0001) {
          crc = (crc >>> 1) ^ 0x8408;
        } else {
          crc = crc >>> 1;
        }
      }
    }
    return crc & 0xffff;
  }

  /**
   * Construye un paquete binario de solicitud Anviz TC_B
   * Formato: [STX(1B)][DevId(4B BE)][CMD(1B)][LEN(2B BE)][DATA(NB)][CRC(2B LE)]
   * @param {number} devId - Device ID (ej: 1 o 1930)
   * @param {number} cmd - Código de comando
   * @param {Buffer|Uint8Array|Array<number>} [data] - Datos opcionales
   * @returns {Buffer}
   */
  static buildPacket(devId = 1, cmd = 0x30, data = Buffer.alloc(0)) {
    const safeDevId = Math.max(0, Number(devId) || 0) >>> 0;
    const safeCmd = (Number(cmd) || 0) & 0xff;
    const dataBuf = Buffer.isBuffer(data)
      ? data
      : ArrayBuffer.isView(data)
        ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        : Array.isArray(data)
          ? Buffer.from(data)
          : Buffer.alloc(0);

    if (dataBuf.length > 400) {
      throw new Error('Payload excede el tamaño máximo de trama Anviz (400 bytes)');
    }

    const packetLen = 1 + 4 + 1 + 2 + dataBuf.length + 2;
    const packet = Buffer.alloc(packetLen);

    packet.writeUInt8(this.STX, 0);
    packet.writeUInt32BE(safeDevId, 1);
    packet.writeUInt8(safeCmd, 5);
    packet.writeUInt16BE(dataBuf.length, 6);

    if (dataBuf.length > 0) {
      dataBuf.copy(packet, 8);
    }

    const crc = this.calcCRC16(packet.subarray(0, packetLen - 2));
    packet.writeUInt16LE(crc, packetLen - 2);

    return packet;
  }

  /**
   * Alias de conveniencia para solicitudes
   */
  static buildRequest(cmd, devId = 0, data = Buffer.alloc(0)) {
    return this.buildPacket(cmd, devId, data);
  }

  /**
   * Construye un paquete binario de respuesta Anviz TC_B
   * Formato: [STX(1B)][DevId(4B BE)][RET_CMD(1B)][STATUS(1B)][LEN(2B BE)][DATA(NB)][CRC(2B LE)]
   */
  static buildResponsePacket(devId = 1, retCmd = 0xb0, status = 0x00, data = Buffer.alloc(0)) {
    const safeDevId = Math.max(0, Number(devId) || 0) >>> 0;
    const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
    const packetLen = 1 + 4 + 1 + 1 + 2 + dataBuf.length + 2;
    const packet = Buffer.alloc(packetLen);

    packet.writeUInt8(this.STX, 0);
    packet.writeUInt32BE(safeDevId, 1);
    packet.writeUInt8(retCmd & 0xff, 5);
    packet.writeUInt8(status & 0xff, 6);
    packet.writeUInt16BE(dataBuf.length, 7);

    if (dataBuf.length > 0) {
      dataBuf.copy(packet, 9);
    }

    const crc = this.calcCRC16(packet.subarray(0, packetLen - 2));
    packet.writeUInt16LE(crc, packetLen - 2);

    return packet;
  }

  /**
   * Alias de conveniencia para solicitudes
   */
  static buildRequest(cmd, devId = 0, data = Buffer.alloc(0)) {
    return this.buildPacket(cmd, devId, data);
  }

  /**
   * Parsea y valida un paquete de respuesta Anviz
   * @param {Buffer} buf
   * @returns {{ valid: boolean, error?: string, devId?: number, retCmd?: number, status?: number, data?: Buffer }}
   */
  static parseResponse(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 11) {
      return { valid: false, error: 'Longitud de paquete insuficiente (< 11 bytes)' };
    }

    if (buf[0] !== this.STX) {
      return { valid: false, error: `Byte de inicio inválido: 0x${buf[0].toString(16)} (esperado 0xA5)` };
    }

    const devId = buf.readUInt32BE(1);
    const retCmd = buf.readUInt8(5);
    const status = buf.readUInt8(6);
    const dataLen = buf.readUInt16BE(7);

    const expectedTotal = 9 + dataLen + 2;
    if (buf.length < expectedTotal) {
      return { valid: false, error: `Paquete incompleto: se esperaban ${expectedTotal} bytes, recibidos ${buf.length}` };
    }

    const payload = buf.subarray(9, 9 + dataLen);
    const receivedCrc = buf.readUInt16LE(9 + dataLen);
    const calculatedCrc = this.calcCRC16(buf.subarray(0, 9 + dataLen));

    if (receivedCrc !== calculatedCrc) {
      return {
        valid: false,
        error: `Error de suma de verificación CRC16 (esperado 0x${calculatedCrc.toString(16)}, recibido 0x${receivedCrc.toString(16)})`
      };
    }

    return {
      valid: true,
      devId,
      retCmd,
      status,
      data: payload
    };
  }

  /**
   * Decodifica información de red de respuesta 0xBA (GET_NET_INFO)
   * Ejemplo real capturado: C0 A8 00 1E FF FF FF 00 00 22 CA 03 50 9F C0 A8 00 01 C0 A8 00 07 00 13 92 00 00
   * @param {Buffer} data
   */
  static parseNetInfo(data) {
    if (!Buffer.isBuffer(data) || data.length < 24) return null;
    const ip = `${data[0]}.${data[1]}.${data[2]}.${data[3]}`;
    const mask = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`;
    const mac = Array.from(data.subarray(8, 14))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(':');
    const gateway = `${data[14]}.${data[15]}.${data[16]}.${data[17]}`;
    const serverIp = `${data[18]}.${data[19]}.${data[20]}.${data[21]}`;
    const port = data.readUInt16BE(23);
    return { ip, mask, mac, gateway, serverIp, port };
  }

  /**
   * Decodifica contadores de memoria de respuesta 0xBC (GET_RECORD_INFO, 18 bytes)
   * @param {Buffer} data
   */
  static parseRecordInfo(data) {
    if (!Buffer.isBuffer(data) || data.length < 18) return null;
    return {
      usersCount: data.readUIntBE(0, 3),
      fingerprintsCount: data.readUIntBE(3, 3),
      passwordsCount: data.readUIntBE(6, 3),
      cardsCount: data.readUIntBE(9, 3),
      allRecordsCount: data.readUIntBE(12, 3),
      newRecordsCount: data.readUIntBE(15, 3)
    };
  }

  /**
   * Decodifica el timestamp de Anviz (segundos desde 2000-01-02 00:00:00 UTC)
   * @param {number} secVal
   * @returns {Date}
   */
  static decodeAnvizTimestamp(secVal) {
    const safeSec = Number(secVal);
    if (!Number.isFinite(safeSec) || safeSec < 0) {
      return new Date(0);
    }
    const BASE_UNIX_SEC = 946771200; // 2000-01-02 00:00:00 UTC
    const epochDate = new Date((BASE_UNIX_SEC + safeSec) * 1000);
    const yr = epochDate.getUTCFullYear();
    if (yr >= 2015 && yr <= 2040) {
      return epochDate;
    }
    return new Date((946684800 + safeSec) * 1000);
  }

  /**
   * Decodifica un lote de registros de fichada (Comando 0x40)
   * Cada registro ocupa 14 bytes: [UserCode: 5B][DateTime: 4B][VerifyType: 1B][RecordType: 1B][WorkCode: 3B]
   * @param {Buffer} dataBuf
   * @param {string} [branch='Neuquen 959']
   */
  static parseAttendanceRecords(dataBuf, branch = 'Neuquen 959') {
    const records = [];
    if (!Buffer.isBuffer(dataBuf) || dataBuf.length < 14) return records;

    let offset = 0;
    let count = dataBuf[0];
    if ((dataBuf.length - 1) % 14 === 0) {
      offset = 1;
    } else {
      count = Math.floor(dataBuf.length / 14);
      offset = 0;
    }

    const RECORD_SIZE = 14;
    const remaining = dataBuf.length - offset;
    const recordsInBuf = Math.floor(remaining / RECORD_SIZE);
    const totalToRead = count > 0 && count <= recordsInBuf ? count : recordsInBuf;

    for (let i = 0; i < totalToRead; i++) {
      const recSlice = dataBuf.subarray(offset, offset + RECORD_SIZE);
      offset += RECORD_SIZE;

      const userCodeNum = recSlice.readUInt32BE(1);
      const userCode = String(userCodeNum || recSlice.readUInt8(4));
      const timeSec = recSlice.readUInt32BE(5);
      const dateObj = this.decodeAnvizTimestamp(timeSec);
      const verifyType = recSlice.readUInt8(9);
      const verifyDesc =
        verifyType === 1 || verifyType === 128
          ? 'Huella Dactilar'
          : verifyType === 3 || verifyType === 130
            ? 'Código / PIN'
            : verifyType === 2
              ? 'Contraseña'
              : 'Biométrico';
      const recordType = recSlice.readUInt8(10);

      records.push({
        userCode,
        timestamp: dateObj.toISOString(),
        verifyType,
        verifyDesc,
        recordType,
        branch
      });
    }

    return records;
  }

  /**
   * Codifica una fecha en 6 bytes para SET_DATETIME (Comando 0x39)
   * Formato Anviz: [Year-2000(1B)][Month(1B)][Day(1B)][Hour(1B)][Min(1B)][Sec(1B)]
   * @param {Date} [date=new Date()]
   * @returns {Buffer}
   */
  static encodeDateTime(date = new Date()) {
    const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
    const buf = Buffer.alloc(6);
    buf.writeUInt8(Math.max(0, d.getFullYear() - 2000) & 0xff, 0);
    buf.writeUInt8((d.getMonth() + 1) & 0xff, 1);
    buf.writeUInt8(d.getDate() & 0xff, 2);
    buf.writeUInt8(d.getHours() & 0xff, 3);
    buf.writeUInt8(d.getMinutes() & 0xff, 4);
    buf.writeUInt8(d.getSeconds() & 0xff, 5);
    return buf;
  }

  /**
   * Decodifica la respuesta 0xB8 de GET_DATETIME (6 bytes)
   * @param {Buffer} dataBuf
   */
  static parseDateTime(dataBuf) {
    if (!Buffer.isBuffer(dataBuf) || dataBuf.length < 6) return null;
    const year = 2000 + dataBuf.readUInt8(0);
    const month = dataBuf.readUInt8(1);
    const day = dataBuf.readUInt8(2);
    const hour = dataBuf.readUInt8(3);
    const min = dataBuf.readUInt8(4);
    const sec = dataBuf.readUInt8(5);
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return { year, month, day, hour, min, sec, formatted: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`, iso };
  }
}

