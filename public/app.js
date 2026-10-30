// @ts-check
/**
 * Frontend de AnvizControl
 */

// Utilidades de Sanitización para prevenir XSS
const Sanitizer = {
  escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};

let currentEmployees = [];
let currentLogs = [];

// Manejo de pestañas
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((tc) => tc.classList.remove('active'));

    btn.classList.add('active');
    const tabId = btn.getAttribute('data-tab');
    if (tabId) {
      document.getElementById(tabId)?.classList.add('active');
    }

    if (tabId === 'tab-live') loadLiveStatus();
    if (tabId === 'tab-logs') loadLogs();
    if (tabId === 'tab-employees') loadEmployees();
    if (tabId === 'tab-reports') setupReportsTab();
  });
});

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

window.closeModal = closeModal;

// 1. MONITOR EN VIVO
async function loadLiveStatus() {
  const tbody = document.querySelector('#tblLive tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Cargando estado en tiempo real...</td></tr>';

  try {
    const res = await fetch('/api/live');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    tbody.innerHTML = '';
    if (data.live.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No hay empleados registrados.</td></tr>';
      return;
    }

    data.live.forEach((item) => {
      const tr = document.createElement('tr');
      const badgeClass = item.status === 'PRESENTE' ? 'badge-success' : item.status === 'RETIRADO' ? 'badge-warning' : 'badge-info';
      const statusLabel = item.status === 'PRESENTE' ? '🟢 Presente' : item.status === 'RETIRADO' ? '🟡 Retirado' : '⚪ Sin fichar hoy';

      tr.innerHTML = `
        <td><strong>${Sanitizer.escapeHTML(item.name)}</strong></td>
        <td>${Sanitizer.escapeHTML(item.dni)}</td>
        <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
        <td>${Sanitizer.escapeHTML(item.lastBranch || '-')}</td>
        <td>${Sanitizer.escapeHTML(item.lastPunchTime || '-')}</td>
        <td><span class="badge badge-info">${item.todayPunchesCount} fichadas</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--danger);">Error cargando monitor: ${Sanitizer.escapeHTML(err.message)}</td></tr>`;
  }
}

// 2. EMPLEADOS CRUD
async function loadEmployees() {
  const tbody = document.querySelector('#tblEmployees tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">Cargando empleados...</td></tr>';

  try {
    const res = await fetch('/api/employees');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    currentEmployees = data.employees;
    tbody.innerHTML = '';

    currentEmployees.forEach((emp) => {
      const tr = document.createElement('tr');
      const statusBadge = emp.status === 'ACTIVE' ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-danger">Inactivo</span>';

      tr.innerHTML = `
        <td><code>${Sanitizer.escapeHTML(emp.id)}</code></td>
        <td><strong>${Sanitizer.escapeHTML(emp.name)}</strong></td>
        <td>${Sanitizer.escapeHTML(emp.dni)}</td>
        <td><span class="badge badge-info">ID: ${Sanitizer.escapeHTML(emp.clockIdBranch1 || 'N/A')}</span></td>
        <td><span class="badge badge-info">ID: ${Sanitizer.escapeHTML(emp.clockIdBranch2 || 'N/A')}</span></td>
        <td>${emp.scheduleType === 'CORTADO' ? 'Cortado (2 tramos)' : 'Corrido (1 tramo)'}</td>
        <td>${Sanitizer.escapeHTML(emp.shiftStart1)} - ${Sanitizer.escapeHTML(emp.shiftEnd1)}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="editEmployee('${emp.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteEmployee('${emp.id}')">🗑️</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    populateEmployeeDropdowns();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="color: var(--danger);">Error: ${Sanitizer.escapeHTML(err.message)}</td></tr>`;
  }
}

function populateEmployeeDropdowns() {
  const repSelect = document.getElementById('repEmployeeSelect');
  const punchSelect = document.getElementById('punchFieldEmp');

  if (repSelect) {
    repSelect.innerHTML = currentEmployees.map((e) => `<option value="${e.id}">${Sanitizer.escapeHTML(e.name)} (DNI: ${Sanitizer.escapeHTML(e.dni)})</option>`).join('');
  }
  if (punchSelect) {
    punchSelect.innerHTML = currentEmployees.map((e) => `<option value="${e.id}">${Sanitizer.escapeHTML(e.name)}</option>`).join('');
  }
}

window.editEmployee = function(id) {
  const emp = currentEmployees.find((e) => e.id === id);
  if (!emp) return;

  document.getElementById('modalEmpTitle').textContent = 'Editar Empleado';
  document.getElementById('empFieldId').value = emp.id;
  document.getElementById('empFieldName').value = emp.name;
  document.getElementById('empFieldDni').value = emp.dni;
  document.getElementById('empFieldClock1').value = emp.clockIdBranch1 || '';
  document.getElementById('empFieldClock2').value = emp.clockIdBranch2 || '';
  document.getElementById('empFieldSchedType').value = emp.scheduleType || 'CORRIDO';
  document.getElementById('empFieldStart1').value = emp.shiftStart1 || '08:00';
  document.getElementById('empFieldEnd1').value = emp.shiftEnd1 || '17:00';
  document.getElementById('empFieldStatus').value = emp.status || 'ACTIVE';

  openModal('modalEmployee');
};

window.deleteEmployee = async function(id) {
  if (!confirm('¿Estás seguro de eliminar este empleado?')) return;
  try {
    const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    loadEmployees();
  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
};

document.getElementById('btnOpenNewEmpModal')?.addEventListener('click', () => {
  document.getElementById('modalEmpTitle').textContent = 'Nuevo Empleado';
  document.getElementById('formEmployee').reset();
  document.getElementById('empFieldId').value = '';
  openModal('modalEmployee');
});

document.getElementById('formEmployee')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const empData = {
    id: document.getElementById('empFieldId').value || undefined,
    name: document.getElementById('empFieldName').value,
    dni: document.getElementById('empFieldDni').value,
    clockIdBranch1: document.getElementById('empFieldClock1').value,
    clockIdBranch2: document.getElementById('empFieldClock2').value,
    scheduleType: document.getElementById('empFieldSchedType').value,
    shiftStart1: document.getElementById('empFieldStart1').value,
    shiftEnd1: document.getElementById('empFieldEnd1').value,
    status: document.getElementById('empFieldStatus').value
  };

  try {
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(empData)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    closeModal('modalEmployee');
    loadEmployees();
  } catch (err) {
    alert('Error al guardar empleado: ' + err.message);
  }
});

// 3. FICHADAS & RECTIFICACIÓN
async function loadLogs() {
  const tbody = document.querySelector('#tblLogs tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Cargando fichadas...</td></tr>';

  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    currentLogs = data.logs;
    tbody.innerHTML = '';

    if (currentLogs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No hay fichadas registradas.</td></tr>';
      return;
    }

    // Mostrar de más recientes a más antiguas
    const sorted = [...currentLogs].reverse();

    sorted.forEach((l) => {
      const tr = document.createElement('tr');
      const dateFormatted = new Date(l.timestamp).toLocaleString('es-AR');
      const originBadge = l.manual ? '<span class="badge badge-warning">✏️ Manual / Rectificada</span>' : '<span class="badge badge-success">🤖 Anviz Reloj</span>';

      tr.innerHTML = `
        <td><small><code>${Sanitizer.escapeHTML(l.id)}</code></small></td>
        <td><strong>${Sanitizer.escapeHTML(l.employeeName)}</strong></td>
        <td>${Sanitizer.escapeHTML(dateFormatted)}</td>
        <td>${Sanitizer.escapeHTML(l.branch)}</td>
        <td>${Sanitizer.escapeHTML(l.verifyDesc || 'Huella')}</td>
        <td>${originBadge}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="editPunch('${l.id}')">✏️ Rectificar</button>
          <button class="btn btn-danger btn-sm" onclick="deletePunch('${l.id}')">🗑️</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: var(--danger);">Error: ${Sanitizer.escapeHTML(err.message)}</td></tr>`;
  }
}

window.editPunch = function(id) {
  const punch = currentLogs.find((l) => l.id === id);
  if (!punch) return;

  const dt = new Date(punch.timestamp);
  const dateStr = dt.toISOString().slice(0, 10);
  const timeStr = dt.toTimeString().slice(0, 8);

  document.getElementById('modalPunchTitle').textContent = 'Rectificar Fichada';
  document.getElementById('punchFieldId').value = punch.id;
  document.getElementById('punchFieldBranch').value = punch.branch || 'Sucursal 1 (Local)';
  document.getElementById('punchFieldDate').value = dateStr;
  document.getElementById('punchFieldTime').value = timeStr;
  document.getElementById('punchFieldNote').value = punch.note || '';

  if (punch.employeeId) {
    document.getElementById('punchFieldEmp').value = punch.employeeId;
  }

  openModal('modalPunch');
};

window.deletePunch = async function(id) {
  if (!confirm('¿Estás seguro de eliminar esta fichada?')) return;
  try {
    const res = await fetch(`/api/logs/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    loadLogs();
  } catch (err) {
    alert('Error al borrar fichada: ' + err.message);
  }
};

document.getElementById('btnOpenNewPunchModal')?.addEventListener('click', () => {
  document.getElementById('modalPunchTitle').textContent = 'Nueva Fichada Manual';
  document.getElementById('formPunch').reset();
  document.getElementById('punchFieldId').value = '';
  const now = new Date();
  document.getElementById('punchFieldDate').value = now.toISOString().slice(0, 10);
  document.getElementById('punchFieldTime').value = now.toTimeString().slice(0, 8);
  openModal('modalPunch');
});

document.getElementById('formPunch')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const punchId = document.getElementById('punchFieldId').value;
  const empId = document.getElementById('punchFieldEmp').value;
  const emp = currentEmployees.find((x) => x.id === empId);

  const branch = document.getElementById('punchFieldBranch').value;
  const dateVal = document.getElementById('punchFieldDate').value;
  const timeVal = document.getElementById('punchFieldTime').value;
  const note = document.getElementById('punchFieldNote').value;

  const fullTimestamp = new Date(`${dateVal}T${timeVal}`).toISOString();
  // Obtener el ID que este empleado tiene en esa sucursal
  const userCode = branch.includes('2') ? (emp?.clockIdBranch2 || '1') : (emp?.clockIdBranch1 || '1');

  try {
    if (punchId) {
      // Edición / Rectificación
      const res = await fetch(`/api/logs/${punchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: fullTimestamp, branch, note })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } else {
      // Alta manual
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userCode,
          branch,
          timestamp: fullTimestamp,
          verifyDesc: 'Manual',
          manual: true,
          note
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    }
    closeModal('modalPunch');
    loadLogs();
  } catch (err) {
    alert('Error al guardar fichada: ' + err.message);
  }
});

// 4. REPORTES & HORAS
let lastCalculatedReport = null;

function setupReportsTab() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  const startInp = document.getElementById('repStartDate');
  const endInp = document.getElementById('repEndDate');
  if (startInp && !startInp.value) startInp.value = firstDay;
  if (endInp && !endInp.value) endInp.value = todayStr;

  populateEmployeeDropdowns();
}

async function runReport() {
  const empId = document.getElementById('repEmployeeSelect').value;
  const start = document.getElementById('repStartDate').value;
  const end = document.getElementById('repEndDate').value;
  const tbody = document.querySelector('#tblReportDetails tbody');
  if (!tbody || !empId) return;

  tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">Calculando asistencia de ambas sucursales...</td></tr>';

  try {
    const res = await fetch(`/api/reports/attendance?employeeId=${empId}&startDate=${start}&endDate=${end}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    lastCalculatedReport = data.report;
    const rep = data.report;

    // Actualizar métricas
    document.getElementById('sumTotalHours').textContent = `${rep.summary.totalHours} h`;
    document.getElementById('sumDaysWorked').textContent = String(rep.summary.daysWorked);
    document.getElementById('sumAbsences').textContent = String(rep.summary.absentDays);
    document.getElementById('sumOddPunches').textContent = String(rep.summary.oddPunchDays);

    tbody.innerHTML = '';
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    rep.days.forEach((d) => {
      const tr = document.createElement('tr');
      const dObj = new Date(d.date + 'T00:00:00');
      const dayName = dayNames[dObj.getDay()];

      let statusBadge = '<span class="badge badge-success">OK</span>';
      if (d.status === 'AUSENTE') statusBadge = '<span class="badge badge-danger">Ausente</span>';
      if (d.status === 'FRANCO') statusBadge = '<span class="badge badge-info">Franco</span>';
      if (d.status === 'FICHADA_INCOMPLETA') statusBadge = '<span class="badge badge-warning">⚠️ Fichada Impar</span>';
      if (d.status === 'LLEGADA_TARDE') statusBadge = `<span class="badge badge-warning">Tarde (+${d.lateMinutes}m)</span>`;

      // Pares
      let pairsHtml = '-';
      if (d.pairs && d.pairs.length > 0) {
        pairsHtml = d.pairs.map((p) => {
          const inT = p.in ? p.in.timestamp.slice(11, 16) : '?';
          const outT = p.out ? p.out.timestamp.slice(11, 16) : '<span style="color:var(--danger)">Falta Salida</span>';
          return `<b>${inT}</b> ➔ <b>${outT}</b>`;
        }).join('<br>');
      }

      const branches = d.branchesVisited.length > 0 ? d.branchesVisited.join(', ') : '-';

      tr.innerHTML = `
        <td><strong>${Sanitizer.escapeHTML(d.date)}</strong></td>
        <td>${dayName}</td>
        <td>${statusBadge}</td>
        <td>${pairsHtml}</td>
        <td><small>${Sanitizer.escapeHTML(branches)}</small></td>
        <td>${d.lateMinutes > 0 ? `+${d.lateMinutes} min` : '-'}</td>
        <td>${d.normalHours} h</td>
        <td>${d.overtimeHours > 0 ? `<b style="color:var(--warning)">+${d.overtimeHours} h</b>` : '-'}</td>
        <td><strong>${d.hoursWorked} h</strong></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="color: var(--danger);">Error: ${Sanitizer.escapeHTML(err.message)}</td></tr>`;
  }
}

document.getElementById('btnRunReport')?.addEventListener('click', runReport);

// Exportar CSV nativo con BOM UTF-8 (Compatible directo con Excel)
document.getElementById('btnExportCSV')?.addEventListener('click', () => {
  if (!lastCalculatedReport) {
    alert('Primero calculá un reporte para exportar');
    return;
  }

  const rep = lastCalculatedReport;
  const headers = ['Fecha', 'Dia', 'Estado', 'Horas Normales', 'Horas Extra', 'Total Horas', 'Sucursales'];
  const rows = [headers];

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  rep.days.forEach((d) => {
    const dObj = new Date(d.date + 'T00:00:00');
    rows.push([
      d.date,
      dayNames[dObj.getDay()],
      d.status,
      String(d.normalHours),
      String(d.overtimeHours),
      String(d.hoursWorked),
      `"${d.branchesVisited.join(' - ')}"`
    ]);
  });

  const csvContent = '\uFEFF' + rows.map((e) => e.join(';')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Reporte_${rep.employee.name.replace(/\s+/g, '_')}_${rep.range.startDate}_${rep.range.endDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// 5. ESCÁNER ANVIZ
document.getElementById('btnStartScan')?.addEventListener('click', async () => {
  const subnet = document.getElementById('scanSubnet').value;
  const start = document.getElementById('scanStart').value;
  const end = document.getElementById('scanEnd').value;
  const statusDiv = document.getElementById('scanStatus');
  const resDiv = document.getElementById('scanResults');

  statusDiv.textContent = `Escaneando subred ${subnet}.${start} a ${subnet}.${end} en puerto 5010...`;
  resDiv.innerHTML = '';

  try {
    const res = await fetch('/api/scanner/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subnet, start, end })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    statusDiv.textContent = `Escaneo finalizado. Se encontraron ${data.found.length} dispositivo(s).`;
    if (data.found.length === 0) {
      resDiv.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">No se detectaron dispositivos Anviz respondiendo en este rango. Si conocés la IP exacta, podés configurarla en el archivo de configuración.</div>';
    } else {
      resDiv.innerHTML = data.found.map((f) => `
        <div style="background: rgba(34,197,94,0.1); border: 1px solid var(--success); padding: 12px; border-radius: 8px; margin-top: 8px;">
          🟢 <b>Anviz Detectado en ${Sanitizer.escapeHTML(f.ip)}:${f.port}</b><br>
          <small>Device ID: ${f.devId || 1} • Info: ${Sanitizer.escapeHTML(f.info || 'Anviz Biometric')}</small>
        </div>
      `).join('');
    }
  } catch (err) {
    statusDiv.textContent = 'Error en escaneo: ' + err.message;
  }
});

document.getElementById('btnRefreshLive')?.addEventListener('click', loadLiveStatus);

// Carga inicial
(async function init() {
  await loadEmployees();
  await loadLiveStatus();
})();
