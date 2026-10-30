#!/usr/bin/env node
// @ts-check
/**
 * ANVIZ REMOTE SYNC AGENT (Agente para la Sucursal a 5 cuadras)
 * 
 * Este script corre de forma silenciosa y desatendida en la PC de la segunda sucursal.
 * Lee periódicamente el reloj Anviz VF30 Pro por cable de red local (puerto 5010)
 * y sube las nuevas fichadas al servidor central sin requerir VPN ni abrir puertos.
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnvizProtocolEngine } from '../engine/AnvizProtocolEngine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE = path.join(__dirname, 'agent_offline_queue.json');

// Configuración predeterminada (modificable por variables de entorno o archivo de config)
const CONFIG = {
  BRANCH_NAME: process.env.BRANCH_NAME || 'Sucursal 2 (5 cuadras)',
  ANVIZ_IP: process.env.ANVIZ_IP || '192.168.0.200',
  ANVIZ_PORT: Number(process.env.ANVIZ_PORT) || 5010,
  ANVIZ_DEV_ID: Number(process.env.ANVIZ_DEV_ID) || 1,
  CENTRAL_SERVER_URL: process.env.CENTRAL_SERVER_URL || 'http://localhost:3000',
  POLL_INTERVAL_SEC: Number(process.env.POLL_INTERVAL_SEC) || 60
};

console.log('=====================================================');
console.log(`[Agente Anviz] Iniciando recolector para: ${CONFIG.BRANCH_NAME}`);
console.log(`[Agente Anviz] Reloj destino: ${CONFIG.ANVIZ_IP}:${CONFIG.ANVIZ_PORT}`);
console.log(`[Agente Anviz] Servidor central: ${CONFIG.CENTRAL_SERVER_URL}`);
console.log('=====================================================');

function loadOfflineQueue() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch {}
  return [];
}

function saveOfflineQueue(queue) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(queue, null, 2), 'utf8');
  } catch (e) {
    console.error('[Agente Anviz] Error guardando cola offline:', e.message);
  }
}

/**
 * Consulta las fichadas almacenadas en el reloj Anviz por TCP
 */
function fetchRecordsFromClock(ip, port, devId) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timeout de conexión con reloj en ${ip}:${port}`));
    }, 5000);

    const receivedChunks = [];

    socket.connect(port, ip, () => {
      // Enviar solicitud de todos los registros (0x40)
      // data: 0x01 (primer bloque) + 0x00...
      const req = AnvizProtocolEngine.buildPacket(devId, AnvizProtocolEngine.CMD.GET_RECORDS, Buffer.from([0x01, 0x19]));
      socket.write(req);
    });

    socket.on('data', (chunk) => {
      receivedChunks.push(chunk);
    });

    socket.on('end', () => {
      clearTimeout(timeout);
      const fullBuffer = Buffer.concat(receivedChunks);
      const parsed = AnvizProtocolEngine.parseResponse(fullBuffer);
      if (parsed.valid && parsed.data) {
        const records = AnvizProtocolEngine.parseAttendanceRecords(parsed.data, CONFIG.BRANCH_NAME);
        resolve(records);
      } else {
        resolve([]);
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Sube registros al servidor central con reintentos y tolerancia a caídas de Internet
 */
async function uploadToServer(records) {
  let queue = loadOfflineQueue();
  if (records.length > 0) {
    queue.push(...records);
  }

  if (queue.length === 0) return;

  console.log(`[Agente Anviz] Intentando sincronizar ${queue.length} fichadas con servidor central...`);

  try {
    const res = await fetch(`${CONFIG.CENTRAL_SERVER_URL}/api/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queue[0]) // Subida atómica o en lote
    });

    if (res.ok) {
      console.log(`[Agente Anviz] ¡Sincronización exitosa!`);
      // Vaciar cola offline
      saveOfflineQueue([]);
    } else {
      console.warn(`[Agente Anviz] El servidor respondió con estado ${res.status}. Fichadas guardadas en cola offline.`);
      saveOfflineQueue(queue);
    }
  } catch (err) {
    console.warn(`[Agente Anviz] Sin conexión al servidor central (${err.message}). Datos resguardados en cola local.`);
    saveOfflineQueue(queue);
  }
}

/**
 * Ciclo principal del agente
 */
async function pollCycle() {
  try {
    console.log(`[${new Date().toLocaleTimeString()}] Consultando reloj Anviz...`);
    const records = await fetchRecordsFromClock(CONFIG.ANVIZ_IP, CONFIG.ANVIZ_PORT, CONFIG.ANVIZ_DEV_ID);
    console.log(`[Agente Anviz] Descargadas ${records.length} fichadas.`);
    await uploadToServer(records);
  } catch (err) {
    console.log(`[Agente Anviz] Aviso de lectura: ${err.message}`);
    // Intenta subir cualquier dato previo que haya quedado pendiente
    await uploadToServer([]);
  }
}

// Iniciar ciclo periódico
pollCycle();
setInterval(pollCycle, CONFIG.POLL_INTERVAL_SEC * 1000);
