// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AttendanceEngine } from './AttendanceEngine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const SESSION_FILE = path.join(DATA_DIR, 'cloud_session.json');

export class CrossChexCloudEngine {
  static BASE_URL = 'https://us.crosschexcloud.com/api';

  /**
   * Lee o guarda la sesión local de CrossChex Cloud (excluida de git por seguridad)
   */
  static getSavedSession() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      }
    } catch {}
    return null;
  }

  static saveSession(sessionData) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2), 'utf8');
  }

  /**
   * Realiza una petición POST autenticada a la API v2.0 de CrossChex Cloud
   * @param {string} endpoint
   * @param {any} payload
   * @param {string} [token]
   */
  static async apiPost(endpoint, payload = {}, token = '') {
    const cleanEndpoint = endpoint.replace(/^\//, '');
    const headers = {
      'Content-Type': 'application/json',
      'x-api-version': '2.0',
      'x-language': 'en_us'
    };
    if (token) {
      headers['x-token'] = token;
    }

    const res = await fetch(`${this.BASE_URL}/${cleanEndpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} en CrossChex Cloud (${cleanEndpoint})`);
    }
    return await res.json();
  }

  /**
   * Inicia sesión en CrossChex Cloud y selecciona la empresa (Regondi srl)
   * @param {string} email
   * @param {string} password
   */
  static async login(email, password) {
    const loginRes = await this.apiPost('user/loginNew', {
      email,
      password,
      company_code: '',
      remember: true
    });

    if (!loginRes || loginRes.code !== 200 || !loginRes.data?.token) {
      throw new Error(loginRes?.description || 'Credenciales inválidas en CrossChex Cloud');
    }

    let token = loginRes.data.token;
    let companyId = loginRes.data.company_id || 14699;

    // Seleccionar empresa para obtener token con company_id vinculado
    const selectRes = await this.apiPost('company/select', { id: companyId }, token);
    if (selectRes && selectRes.code === 200 && selectRes.data?.token) {
      token = selectRes.data.token;
    }

    this.saveSession({
      email,
      token,
      companyId,
      updatedAt: new Date().toISOString()
    });

    return { token, companyId };
  }

  /**
   * Sincroniza empleados, relojes (Neuquen 959 y Ballarini 1111) y fichadas desde CrossChex Cloud
   * @param {{ token?: string, email?: string, password?: string, startDate?: string, endDate?: string }} [options]
   */
  static async syncFromCloud(options = {}) {
    let token = options.token;

    if (!token && options.email && options.password) {
      const auth = await this.login(options.email, options.password);
      token = auth.token;
    }

    if (!token) {
      const saved = this.getSavedSession();
      if (saved?.token) {
        token = saved.token;
      }
    }

    if (!token) {
      throw new Error('No hay sesión activa de CrossChex Cloud. Ingrese sus credenciales para sincronizar.');
    }

    const now = new Date();
    const startDate = options.startDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00-03:00`;
    const endDate = options.endDate || `${now.toISOString().slice(0, 10)}T23:59:59-03:00`;

    // 1. Obtener dispositivos (Neuquen 959 y Ballarini 1111)
    const devRes = await this.apiPost('device/grid', { page: 1, perPage: 50, keyword: '', department_id: [0] }, token);
    const cloudDevices = devRes?.data?.list || [];

    // 2. Obtener empleados (24 empleados de Regondi srl / Regondi)
    const empRes = await this.apiPost('employee/grid', { page: 1, perPage: 100, keyword: '', department_id: [0] }, token);
    const cloudEmployees = empRes?.data?.list || [];

    // 3. Obtener turnos
    const shiftRes = await this.apiPost('shift/grid', { page: 1, perPage: 50 }, token);
    const cloudShifts = shiftRes?.data?.list || [];

    // 4. Obtener fichadas paginadas
    const allCloudRecords = [];
    let page = 1;
    let totalPages = 1;

    do {
      const recRes = await this.apiPost(
        'record/grid',
        {
          page,
          perPage: 200,
          keyword: '',
          department_id: [0],
          startdate: startDate,
          enddate: endDate,
          order_col: 'checktime',
          order_dir: 'DESC',
          source: ''
        },
        token
      );

      const list = recRes?.data?.list || [];
      allCloudRecords.push(...list);
      totalPages = Math.min(10, Number(recRes?.data?.pageCount) || 1);
      page++;
    } while (page <= totalPages);

    // 5. Persistir dispositivos, empleados y fichadas en AttendanceEngine
    const syncSummary = AttendanceEngine.importCrossChexCloudData({
      devices: cloudDevices,
      employees: cloudEmployees,
      shifts: cloudShifts,
      records: allCloudRecords
    });

    return {
      success: true,
      syncedAt: new Date().toISOString(),
      ...syncSummary
    };
  }
}
