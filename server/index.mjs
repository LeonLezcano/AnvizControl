// @ts-check
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnvizProtocolEngine } from '../engine/AnvizProtocolEngine.mjs';
import { AnvizNetworkScanner } from '../engine/AnvizNetworkScanner.mjs';
import { AttendanceEngine } from '../engine/AttendanceEngine.mjs';
import { seedDemoDataIfEmpty } from '../engine/SeedData.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

// Inicializar demo
seedDemoDataIfEmpty();

const PORT = process.env.PORT || 3000;

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        // Protección contra desbordamiento de memoria
        req.destroy();
        reject(new Error('Payload demasiado grande'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  // Manejo de CORS pre-flight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  try {
    // ==========================================
    // API: EMPLEADOS (CRUD)
    // ==========================================
    if (pathname === '/api/employees' && req.method === 'GET') {
      const emps = AttendanceEngine.getEmployees();
      return sendJson(res, 200, { success: true, employees: emps });
    }

    if (pathname === '/api/employees' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.name || !body.dni) {
        return sendJson(res, 400, { success: false, error: 'El nombre y DNI son obligatorios' });
      }
      const saved = AttendanceEngine.saveEmployee(body);
      return sendJson(res, 201, { success: true, employee: saved });
    }

    if (pathname.startsWith('/api/employees/') && req.method === 'DELETE') {
      const id = pathname.replace('/api/employees/', '');
      AttendanceEngine.deleteEmployee(id);
      return sendJson(res, 200, { success: true, message: 'Empleado eliminado' });
    }

    // ==========================================
    // API: FICHADAS Y LOGS (CRUD Y RECTIFICACIÓN)
    // ==========================================
    if (pathname === '/api/logs' && req.method === 'GET') {
      const logs = AttendanceEngine.getRawLogs();
      const employees = AttendanceEngine.getEmployees();
      // Asociar nombre de empleado para facilidad de visualización
      const enriched = logs.map((l) => {
        const emp = AttendanceEngine.resolveEmployee(l.userCode, l.branch, employees);
        return {
          ...l,
          employeeName: emp ? emp.name : `Desconocido (ID ${l.userCode})`,
          employeeId: emp ? emp.id : null
        };
      });
      return sendJson(res, 200, { success: true, logs: enriched });
    }

    if (pathname === '/api/logs' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.userCode || !body.timestamp) {
        return sendJson(res, 400, { success: false, error: 'Código de usuario y timestamp son requeridos' });
      }
      const result = AttendanceEngine.appendLogs([body]);
      return sendJson(res, 201, { success: true, result });
    }

    if (pathname.startsWith('/api/logs/') && req.method === 'PUT') {
      const logId = pathname.replace('/api/logs/', '');
      const body = await parseBody(req);
      const updated = AttendanceEngine.updateLog(logId, body);
      if (!updated) {
        return sendJson(res, 404, { success: false, error: 'Fichada no encontrada' });
      }
      return sendJson(res, 200, { success: true, log: updated });
    }

    if (pathname.startsWith('/api/logs/') && req.method === 'DELETE') {
      const logId = pathname.replace('/api/logs/', '');
      AttendanceEngine.deleteLog(logId);
      return sendJson(res, 200, { success: true, message: 'Fichada eliminada correctamente' });
    }

    // ==========================================
    // API: ASISTENCIA Y REPORTES
    // ==========================================
    if (pathname === '/api/reports/attendance' && req.method === 'GET') {
      const empId = parsedUrl.searchParams.get('employeeId');
      const start = parsedUrl.searchParams.get('startDate') || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const end = parsedUrl.searchParams.get('endDate') || new Date().toISOString().slice(0, 10);

      if (!empId) {
        return sendJson(res, 400, { success: false, error: 'Debe especificar el employeeId' });
      }

      const report = AttendanceEngine.calculateAttendance(empId, start, end);
      return sendJson(res, 200, { success: true, report });
    }

    // ==========================================
    // API: MONITOR EN VIVO
    // ==========================================
    if (pathname === '/api/live' && req.method === 'GET') {
      const live = AttendanceEngine.getLiveStatus();
      return sendJson(res, 200, { success: true, live, timestamp: new Date().toISOString() });
    }

    // ==========================================
    // API: ESCÁNER Y DIAGNÓSTICO DE RED ANVIZ
    // ==========================================
    if (pathname === '/api/scanner/run' && req.method === 'POST') {
      const body = await parseBody(req);
      const subnet = body.subnet || '192.168.0';
      const start = Number(body.start) || 1;
      const end = Number(body.end) || 254;

      const found = await AnvizNetworkScanner.scanSubnet(subnet, start, end);
      return sendJson(res, 200, { success: true, found });
    }

    if (pathname === '/api/scanner/test-host' && req.method === 'POST') {
      const body = await parseBody(req);
      const ip = body.ip || '192.168.0.1';
      const port = Number(body.port) || 5010;
      const result = await AnvizNetworkScanner.testAnvizHost(ip, port, 1500);
      return sendJson(res, 200, { success: true, result });
    }

    // ==========================================
    // SERVIR ARCHIVOS ESTÁTICOS
    // ==========================================
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    // Evitar Directory Traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Acceso denegado');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // Fallback a 404
    sendJson(res, 404, { success: false, error: 'Ruta no encontrada' });
  } catch (err) {
    console.error('Error en servidor:', err);
    sendJson(res, 500, { success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`[AnvizControl] Servidor activo en http://localhost:${PORT}`);
});
