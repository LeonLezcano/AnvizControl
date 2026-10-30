// @ts-check
/**
 * Anviz CRC16 implementation for TC_B / Anviz Biometric Protocol
 * Polynomial: 0x1021 (CRC-CCITT) / Anviz custom table
 */

const CRC16_TAB = [
  0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5, 0x60c6, 0x70e7,
  0x8108, 0x9129, 0xa14a, 0xb16b, 0xc18c, 0xd1ad, 0xe1ce, 0xf1ef,
  0x1231, 0x0210, 0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6,
  0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c, 0xf3ff, 0xe3de,
  0x2462, 0x3443, 0x0420, 0x1401, 0x64e6, 0x74c7, 0x44a4, 0x5485,
  0xa56a, 0xb54b, 0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d,
  0x3653, 0x2672, 0x1611, 0x0630, 0x76d7, 0x66f6, 0x5695, 0x46b4,
  0xb75b, 0xa77a, 0x9719, 0x8738, 0xf7df, 0xe7fe, 0xd79d, 0xc7bc,
  0x48c4, 0x58e5, 0x6886, 0x78a7, 0x0840, 0x1861, 0x2802, 0x3823,
  0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948, 0x9969, 0xa90a, 0xb92b,
  0x5af5, 0x4ad4, 0x7ab7, 0x6a96, 0x1a71, 0x0a50, 0x3a33, 0x2a12,
  0xdbfd, 0xcbdc, 0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b, 0xab1a,
  0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03, 0x0c60, 0x1c41,
  0xedae, 0xfd8f, 0xcdec, 0xddcd, 0xad2a, 0xbd0b, 0x8d68, 0x9d49,
  0x7e97, 0x6eb6, 0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0x0e70,
  0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a, 0x9f59, 0x8f78,
  0x9188, 0x81a9, 0xb1ca, 0xa1eb, 0xd10c, 0xc12d, 0xf14e, 0xe16f,
  0x1080, 0x00a1, 0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067,
  0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c, 0xe37f, 0xf35e,
  0x02b1, 0x1290, 0x22f3, 0x32d2, 0x4235, 0x5214, 0x6277, 0x7256,
  0xb5ea, 0xa5cb, 0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d,
  0x34e2, 0x24c3, 0x14a0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405,
  0xa7db, 0xb7fa, 0x8799, 0x97b8, 0xe75f, 0xf77e, 0xc71d, 0xd73c,
  0x26d3, 0x36f2, 0x0691, 0x16b0, 0x6657, 0x7676, 0x4615, 0x5634,
  0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9, 0xb98a, 0xa9ab,
  0x5844, 0x4865, 0x7806, 0x6827, 0x18c0, 0x08e1, 0x3882, 0x28a3,
  0xcb7d, 0xdb5c, 0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a,
  0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1, 0x1ad0, 0x2ab3, 0x3a92,
  0xfd2e, 0xed0f, 0xdd6c, 0xcd4d, 0xbdaa, 0xad8b, 0x9de8, 0x8dc9,
  0x7c26, 0x6c07, 0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0x0cc1,
  0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba, 0x8fd9, 0x9ff8,
  0x6e17, 0x7e36, 0x4e55, 0x5e74, 0x2e93, 0x3eb2, 0x0ed1, 0x1ef0
];

export class AnvizProtocolEngine {
  static STX = 0xa5;
  static DEFAULT_PORT = 5010;

  // Comandos estándar Anviz VF30 / T5 / A300
  static CMD = {
    GET_INFO1: 0x30,
    SET_INFO1: 0x31,
    GET_INFO2: 0x32,
    SET_INFO2: 0x33,
    GET_DATETIME: 0x38,
    SET_DATETIME: 0x39,
    GET_RECORD_INFO: 0x3c,
    GET_RECORDS: 0x40,
    CLEAR_RECORDS: 0x4e,
    GET_STAFF_INFO: 0x72,
    SET_STAFF_INFO: 0x73,
    DELETE_STAFF: 0x4c
  };

  /**
   * Calcula el CRC16 de Anviz sobre un Buffer
   * @param {Buffer} buf
   * @returns {number}
   */
  static calcCRC16(buf) {
    let crc = 0xffff;
    for (let i = 0; i < buf.length; i++) {
      const byte = buf[i];
      const index = ((crc >> 8) ^ byte) & 0xff;
      crc = ((crc << 8) ^ CRC16_TAB[index]) & 0xffff;
    }
    return crc;
  }

  /**
   * Construye un paquete binario Anviz TC_B (petición o respuesta)
   * Formato de Respuesta: [STX(1B)][DevId(4B)][RET_CMD(1B)][STATUS(1B)][LEN(2B)][DATA(NB)][CRC(2B)]
   * Formato de Petición:  [STX(1B)][DevId(4B)][CMD(1B)][LEN(2B)][DATA(NB)][CRC(2B)]
   */
  static buildResponsePacket(devId = 1, retCmd = 0xb0, status = 0x00, data = Buffer.alloc(0)) {
    const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const packetLen = 1 + 4 + 1 + 1 + 2 + dataBuf.length + 2;
    const packet = Buffer.alloc(packetLen);

    // STX
    packet.writeUInt8(this.STX, 0);
    // DevID
    packet.writeUInt32BE(devId, 1);
    // RET_CMD
    packet.writeUInt8(retCmd, 5);
    // STATUS (0x00 = OK)
    packet.writeUInt8(status, 6);
    // LEN
    packet.writeUInt16BE(dataBuf.length, 7);
    // DATA
    if (dataBuf.length > 0) {
      dataBuf.copy(packet, 9);
    }
    // CRC16
    const crc = this.calcCRC16(packet.subarray(0, packetLen - 2));
    packet.writeUInt16BE(crc, packetLen - 2);

    return packet;
  }

  /**
   * Construye un paquete binario Anviz TC_B de solicitud
   * Formato: [STX(1B)][DevId(4B)][CMD(1B)][LEN(2B)][DATA(NB)][CRC(2B)]
   * @param {number} devId - Device ID (ej: 1)
   * @param {number} cmd - Código de comando
   * @param {Buffer|Uint8Array|Array<number>} [data] - Datos opcionales
   * @returns {Buffer}
   */
  static buildPacket(devId = 1, cmd = 0x30, data = Buffer.alloc(0)) {
    const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const packetLen = 1 + 4 + 1 + 2 + dataBuf.length + 2;
    const packet = Buffer.alloc(packetLen);

    // STX
    packet.writeUInt8(this.STX, 0);
    // DevID (4 bytes big-endian)
    packet.writeUInt32BE(devId, 1);
    // CMD
    packet.writeUInt8(cmd, 5);
    // LEN (2 bytes big-endian)
    packet.writeUInt16BE(dataBuf.length, 6);
    // DATA
    if (dataBuf.length > 0) {
      dataBuf.copy(packet, 8);
    }

    // CRC16 calculado sobre todo desde STX hasta el fin de DATA
    const crc = this.calcCRC16(packet.subarray(0, packetLen - 2));
    packet.writeUInt16BE(crc, packetLen - 2);

    return packet;
  }

  /**
   * Parsea y valida un paquete de respuesta Anviz
   * @param {Buffer} buf
   * @returns {{ valid: boolean, error?: string, devId?: number, retCmd?: number, status?: number, data?: Buffer }}
   */
  static parseResponse(buf) {
    if (!buf || buf.length < 9) {
      return { valid: false, error: 'Longitud de paquete insuficiente (< 9 bytes)' };
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
    const receivedCrc = buf.readUInt16BE(9 + dataLen);
    const calculatedCrc = this.calcCRC16(buf.subarray(0, 9 + dataLen));

    if (receivedCrc !== calculatedCrc) {
      return { valid: false, error: `Error de suma de verificación CRC16 (esperado 0x${calculatedCrc.toString(16)}, recibido 0x${receivedCrc.toString(16)})` };
    }

    return {
      valid: true,
      devId,
      retCmd,
      status, // 0x00 = OK
      data: payload
    };
  }

  /**
   * Decodifica la fecha y hora de Anviz.
   * En Anviz VF30/TC_B, el timestamp son segundos transcurridos desde el 2000-01-02 00:00:00 UTC
   * o una representación empaquetada. Se provee soporte universal.
   * @param {number} secVal
   * @returns {Date}
   */
  static decodeAnvizTimestamp(secVal) {
    // Época Anviz: 2000-01-02 00:00:00 UTC = 946771200 seg Unix
    const BASE_UNIX_SEC = 946771200;
    const epochDate = new Date((BASE_UNIX_SEC + secVal) * 1000);
    // Validación de rango sensato (entre 2020 y 2035)
    const yr = epochDate.getUTCFullYear();
    if (yr >= 2020 && yr <= 2035) {
      return epochDate;
    }
    // Fallback estándar si el reloj usa fecha base 2000-01-01
    const altEpoch = new Date((946684800 + secVal) * 1000);
    return altEpoch;
  }

  /**
   * Decodifica un lote de registros de fichada (Comando 0x40 / 0x3C)
   * Cada registro en Anviz VF30 estándar ocupa 14 bytes:
   * [UserCode: 5B][DateTime: 4B][VerifyType: 1B][RecordType: 1B][WorkCode: 3B]
   * @param {Buffer} dataBuf
   * @param {string} [branch='Sucursal']
   * @returns {Array<{ userCode: string, timestamp: string, verifyType: number, verifyDesc: string, recordType: number, branch: string }>}
   */
  static parseAttendanceRecords(dataBuf, branch = 'Sucursal') {
    const records = [];
    if (!dataBuf || dataBuf.length < 1) return records;

    // El primer byte de respuesta de datos en 0x40 suele ser la cantidad de registros en este paquete
    let offset = 0;
    let count = dataBuf[0];
    offset = 1;

    // Si el conteo * 14 no coincide con la longitud, parseamos por múltiplo de 14
    const RECORD_SIZE = 14;
    const remaining = dataBuf.length - offset;
    const recordsInBuf = Math.floor(remaining / RECORD_SIZE);

    const totalToRead = count > 0 && count <= recordsInBuf ? count : recordsInBuf;

    for (let i = 0; i < totalToRead; i++) {
      const recSlice = dataBuf.subarray(offset, offset + RECORD_SIZE);
      offset += RECORD_SIZE;

      // UserCode: 5 bytes BCD o entero de 40 bits
      // Usualmente los 4 bytes bajos son el ID
      const userCodeNum = recSlice.readUInt32BE(1);
      const userCode = String(userCodeNum || recSlice.readUInt8(4));

      // DateTime: 4 bytes big endian
      const timeSec = recSlice.readUInt32BE(5);
      const dateObj = this.decodeAnvizTimestamp(timeSec);

      // VerifyType: 1 byte
      // 0: Sin definir, 1: Huella (FP), 2: Contraseña, 3: Tarjeta RFID, 4: Cara, etc.
      const verifyType = recSlice.readUInt8(9);
      const verifyDesc = verifyType === 1 ? 'Huella' : verifyType === 3 ? 'Tarjeta RFID' : verifyType === 2 ? 'PIN' : 'Biométrico';

      // RecordType: 1 byte (0: Fichada común, 1: Fichada de alarma, etc.)
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
}
