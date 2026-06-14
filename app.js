import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// RECUERDA PONER TUS DATOS DE FIREBASE AQUÍ
const firebaseConfig = {
    apiKey: "AIzaSyBxbTdaqWLZMVd7jmPr2zqByubhfI6qB9g",
    authDomain: "proyecto1-9640f.firebaseapp.com",
    projectId: "proyecto1-9640f",
    storageBucket: "proyecto1-9640f.firebasestorage.app",
    messagingSenderId: "444721038399",
    appId: "1:444721038399:web:90087e118688d5db6a648a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// GLOBALES
let cierreSeleccionadoId = null;
let comisionTuuActual = 0.0237; 
let datosCierresGlobales = [];
let listaEmpleadosGlobales = [];
let chartRevenueInstance = null;
let chartInsumosInstance = null;
let filtroTiempoActual = 'semana';
let empleadoSeleccionadoId = null;

// FORMATEADOR DE MONEDA (El Puntico)
document.addEventListener('input', (e) => {
    if(e.target.classList.contains('currency-input')) {
        let value = e.target.value.replace(/\D/g, "");
        if (value === "") { e.target.value = ""; return; }
        e.target.value = Number(value).toLocaleString('de-DE'); 
    }
});
function parseNum(str) { return str ? Number(str.replace(/\./g, "")) : 0; }

// AUTENTICACIÓN
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('user-email-display').innerText = user.email;
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('dashboard-screen').classList.add('active');
        escucharCierres(); escucharInsumos(); escucharGastos(); escucharPersonal(); escucharAsistencias();
    } else {
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('dashboard-screen').classList.remove('active');
    }
});

document.getElementById('form-login').addEventListener('submit', (e) => {
    e.preventDefault();
    signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value).catch(()=>alert("Error al entrar"));
});
document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

// ==========================================
// PANEL FINANCIERO Y GRÁFICO INTERACTIVO
// ==========================================
document.getElementById('cfg-tuu').addEventListener('input', (e) => { comisionTuuActual = Number(e.target.value) / 100; procesarCierres(); });

// Control de los nuevos botones de filtro (Esta Semana, Este Mes, Este Año)
let periodoGraficoActual = 'semana';

window.cambiarPeriodoGrafico = function(periodo) {
    periodoGraficoActual = periodo;
    
    // Cambiar color de los botones
    document.getElementById('btn-filtro-semana').classList.remove('active');
    document.getElementById('btn-filtro-mes').classList.remove('active');
    document.getElementById('btn-filtro-ano').classList.remove('active');
    
    if(periodo === 'semana') document.getElementById('btn-filtro-semana').classList.add('active');
    if(periodo === 'mes') document.getElementById('btn-filtro-mes').classList.add('active');
    if(periodo === 'ano') document.getElementById('btn-filtro-ano').classList.add('active');
    
    // Limpiar calendarios manuales
    document.getElementById('grafico-fecha-inicio').value = "";
    document.getElementById('grafico-fecha-fin').value = "";
    
    procesarCierres();
}

// Escuchar los calendarios manuales
setTimeout(() => {
    const inputInicio = document.getElementById('grafico-fecha-inicio');
    const inputFin = document.getElementById('grafico-fecha-fin');
    if(inputInicio && inputFin) {
        inputInicio.addEventListener('change', () => { periodoGraficoActual = 'manual'; procesarCierres(); });
        inputFin.addEventListener('change', () => { periodoGraficoActual = 'manual'; procesarCierres(); });
    }
}, 1000);

function escucharCierres() {
    onSnapshot(query(collection(db, "cierres_caja"), orderBy("fecha", "desc")), (snapshot) => {
        datosCierresGlobales = [];
        snapshot.forEach(doc => datosCierresGlobales.push({ id: doc.id, ...doc.data() }));
        procesarCierres();
    });
}

function procesarCierres() {
    let totalBruto = 0; let totalNeto = 0;
    let ventasPorFecha = {}; 
    
    const tzHoy = new Date();
    const strHoy = tzHoy.toISOString().split('T')[0];
    const tzAyer = new Date(tzHoy); tzAyer.setDate(tzHoy.getDate() - 1);
    const strAyer = tzAyer.toISOString().split('T')[0];

    // 1. Cálculos de las tarjetas de arriba (Totales, Variación, Mejor Día)
    datosCierresGlobales.forEach(c => {
        const totalDia = c.venta_efectivo + c.venta_tarjeta_bruta;
        const netoDia = c.venta_efectivo + (c.venta_tarjeta_bruta - (c.venta_tarjeta_bruta * comisionTuuActual));
        
        totalBruto += totalDia;
        totalNeto += netoDia;
        ventasPorFecha[c.fecha] = (ventasPorFecha[c.fecha] || 0) + totalDia;
    });

    document.getElementById('kpi-ingresos').innerText = "$" + totalBruto.toLocaleString('de-DE');
    document.getElementById('kpi-neta').innerText = "$" + Math.round(totalNeto).toLocaleString('de-DE');

    let maxVenta = 0; let maxFecha = "-";
    for(const [f, v] of Object.entries(ventasPorFecha)) { if(v > maxVenta) { maxVenta = v; maxFecha = f; } }
    document.getElementById('kpi-mejor-dia').innerText = maxFecha !== "-" ? `${maxFecha} ($${maxVenta.toLocaleString('de-DE')})` : "-";

    const vHoy = ventasPorFecha[strHoy] || 0;
    const vAyer = ventasPorFecha[strAyer] || 0;
    const variacionEl = document.getElementById('kpi-variacion');
    if (vAyer === 0 && vHoy > 0) { variacionEl.innerText = "+100% 🚀"; variacionEl.style.color = "green"; }
    else if (vAyer === 0 && vHoy === 0) { variacionEl.innerText = "0%"; variacionEl.style.color = "gray"; }
    else {
        const pct = ((vHoy - vAyer) / vAyer) * 100;
        variacionEl.innerText = (pct > 0 ? "+" : "") + pct.toFixed(1) + "%";
        variacionEl.style.color = pct >= 0 ? "green" : "red";
    }

    // 2. Lógica Estricta de Tiempo para el Gráfico
    let cierresOrdenados = [...datosCierresGlobales].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    let fechaInicioFiltro, fechaFinFiltro;
    
    if (periodoGraficoActual === 'semana') {
        const diaSemana = tzHoy.getDay();
        const diferenciaLunes = tzHoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
        fechaInicioFiltro = new Date(new Date(tzHoy).setDate(diferenciaLunes));
        fechaInicioFiltro.setHours(0,0,0,0);
        fechaFinFiltro = new Date(fechaInicioFiltro);
        fechaFinFiltro.setDate(fechaInicioFiltro.getDate() + 6);
        fechaFinFiltro.setHours(23,59,59,999);
    } else if (periodoGraficoActual === 'mes') {
        fechaInicioFiltro = new Date(tzHoy.getFullYear(), tzHoy.getMonth(), 1, 0, 0, 0);
        fechaFinFiltro = new Date(tzHoy.getFullYear(), tzHoy.getMonth() + 1, 0, 23, 59, 59);
    } else if (periodoGraficoActual === 'ano') {
        fechaInicioFiltro = new Date(tzHoy.getFullYear(), 0, 1, 0, 0, 0);
        fechaFinFiltro = new Date(tzHoy.getFullYear(), 11, 31, 23, 59, 59);
    } else if (periodoGraficoActual === 'manual') {
        const ini = document.getElementById('grafico-fecha-inicio').value;
        const fin = document.getElementById('grafico-fecha-fin').value;
        fechaInicioFiltro = ini ? new Date(ini + "T00:00:00") : new Date(0);
        fechaFinFiltro = fin ? new Date(fin + "T23:59:59") : new Date();
    }

    let datosFiltrados = cierresOrdenados.filter(c => {
        const fCierre = new Date(c.fecha + "T00:00:00");
        return fCierre >= fechaInicioFiltro && fCierre <= fechaFinFiltro;
    });

    let labels = [];
    let valoresEfectivo = [];
    let valoresTarjeta = [];

    // 3. Preparar los datos visuales
    if (periodoGraficoActual === 'semana') {
        labels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        valoresEfectivo = [0, 0, 0, 0, 0, 0, 0];
        valoresTarjeta = [0, 0, 0, 0, 0, 0, 0];
        const mapaDias = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

        datosFiltrados.forEach(c => {
            const fCierre = new Date(c.fecha + "T00:00:00");
            const indiceDia = mapaDias[fCierre.getDay()];
            if (indiceDia !== undefined) {
                valoresEfectivo[indiceDia] = c.venta_efectivo;
                valoresTarjeta[indiceDia] = c.venta_tarjeta_bruta;
            }
        });
    } else {
        datosFiltrados.forEach(c => {
            const f = new Date(c.fecha + "T00:00:00");
            labels.push(f.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }));
            valoresEfectivo.push(c.venta_efectivo);
            valoresTarjeta.push(c.venta_tarjeta_bruta);
        });
    }

    renderizarGrafica(valoresEfectivo, valoresTarjeta, labels, datosFiltrados);
    renderizarTablaCierres();
}

function renderizarGrafica(datosEfectivo, datosTarjeta, labels, datosFiltrados) {
    const ctx = document.getElementById('revenueChart');
    if(!ctx) return;

    if(chartRevenueInstance) chartRevenueInstance.destroy();
    
    chartRevenueInstance = new Chart(ctx.getContext('2d'), {
        type: 'bar', // Cambiado a barras para que diferencie efectivo de tarjeta
        data: { 
            labels: labels, 
            datasets: [
                { label: 'Efectivo', data: datosEfectivo, backgroundColor: '#1d3557', borderRadius: 4 },
                { label: 'Tarjetas (Bruto)', data: datosTarjeta, backgroundColor: '#e63946', borderRadius: 4 }
            ] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true },
                y: { stacked: true, ticks: { callback: value => '$' + value.toLocaleString('de-DE') } }
            },
            onClick: (e, elementos) => {
                // Al hacer clic te envía al historial
                if (elementos.length > 0) {
                    if (typeof window.showSection === 'function') window.showSection('cierre-caja');
                    else showSection('cierre-caja');
                    setTimeout(() => { document.getElementById('tabla-cierres').scrollIntoView({ behavior: 'smooth' }); }, 150);
                }
            }
        }
    });
}

function renderizarTablaCierres() {
    const tbody = document.querySelector('#tabla-cierres tbody'); tbody.innerHTML = "";
    let data = [...datosCierresGlobales];
    if(document.getElementById('sort-z').value === 'fecha-asc') data.reverse();
    
    data.forEach(c => {
        // Calculamos el Total Bruto sumando efectivo + tarjetas
        const totalBruto = c.venta_efectivo + c.venta_tarjeta_bruta;
        
        const dTuu = c.venta_tarjeta_bruta * comisionTuuActual;
        const neto = c.venta_efectivo + (c.venta_tarjeta_bruta - dTuu);
        const tr = document.createElement('tr');
        const tieneNota = (c.descripcion && c.descripcion.trim() !== "") ? "Sí" : "No";
        
        // Agregamos la columna del totalBruto en el HTML de la fila
        tr.innerHTML = `<td>${c.fecha}</td><td><strong>${c.responsable}</strong></td><td>$${c.venta_efectivo.toLocaleString('de-DE')}</td><td>$${c.venta_tarjeta_bruta.toLocaleString('de-DE')}</td><td><strong>$${totalBruto.toLocaleString('de-DE')}</strong></td><td style="color:green">$${Math.round(neto).toLocaleString('de-DE')}</td><td>${tieneNota}</td>`;
        
        // Al hacer clic, abre el modal
        tr.onclick = () => {
            cierreSeleccionadoId = c.id; // Guardamos el ID del cierre que tocaste
            
            // Asegurarnos de que el modal muestre la vista normal y no el formulario
            document.getElementById('modal-z-body').classList.remove('hidden');
            document.getElementById('modal-z-actions').classList.remove('hidden');
            document.getElementById('form-editar-z').classList.add('hidden');

            document.getElementById('modal-z').classList.remove('hidden');
            document.getElementById('modal-z-body').innerHTML = `
                <p><strong>Fecha:</strong> ${c.fecha}</p>
                <p><strong>Cajero:</strong> ${c.responsable}</p>
                <hr style="margin:10px 0;">
                <p><strong>Total Efectivo:</strong> $${c.venta_efectivo.toLocaleString('de-DE')}</p>
                <p><strong>Tarjetas (Total):</strong> $${c.venta_tarjeta_bruta.toLocaleString('de-DE')}</p>
                <h3 style="color:#1d3557; margin-top:10px;">Total Bruto: $${totalBruto.toLocaleString('de-DE')}</h3>
                <p style="color:red; margin-top:10px;"><strong>Descuento Tuu (-):</strong> $${Math.round(dTuu).toLocaleString('de-DE')}</p>
                <h3 style="color:green; margin-top:10px;">Neto Diario: $${Math.round(neto).toLocaleString('de-DE')}</h3>
                <div style="background:#f8f9fa; padding:10px; margin-top:10px; border-radius:5px;">
                    <strong>Notas:</strong> ${c.descripcion || "Sin observaciones."}
                </div>
            `;
        };
        tbody.appendChild(tr);
    });
}

// --- LÓGICA DE BOTONES EDITAR Y ELIMINAR Z ---

// Función para cancelar edición
window.cancelarEdicionZ = function() {
    document.getElementById('modal-z-body').classList.remove('hidden');
    document.getElementById('modal-z-actions').classList.remove('hidden');
    document.getElementById('form-editar-z').classList.add('hidden');
}

// Botón: Mostrar formulario para Editar
document.getElementById('btn-editar-z').addEventListener('click', () => {
    // Buscar los datos originales
    const cierre = datosCierresGlobales.find(c => c.id === cierreSeleccionadoId);
    
    // Rellenar el formulario oculto con los datos actuales
    document.getElementById('edit-z-efectivo').value = cierre.venta_efectivo.toLocaleString('de-DE');
    document.getElementById('edit-z-tarjeta').value = cierre.venta_tarjeta_bruta.toLocaleString('de-DE');
    document.getElementById('edit-z-desc').value = cierre.descripcion || "";
    
    // Ocultar la vista normal y mostrar el formulario
    document.getElementById('modal-z-body').classList.add('hidden');
    document.getElementById('modal-z-actions').classList.add('hidden');
    document.getElementById('form-editar-z').classList.remove('hidden');
});

// Enviar el formulario de Edición a la base de datos
document.getElementById('form-editar-z').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nuevoEfectivo = parseNum(document.getElementById('edit-z-efectivo').value);
    const nuevaTarjeta = parseNum(document.getElementById('edit-z-tarjeta').value);
    const nuevaDesc = document.getElementById('edit-z-desc').value;

    // Actualizar en Firestore
    await updateDoc(doc(db, "cierres_caja", cierreSeleccionadoId), {
        venta_efectivo: nuevoEfectivo,
        venta_tarjeta_bruta: nuevaTarjeta,
        descripcion: nuevaDesc
    });
    
    cerrarModal('modal-z'); // Cerrar modal al terminar
});

// Botón: Eliminar registro
document.getElementById('btn-eliminar-z').addEventListener('click', async () => {
    const confirmar = confirm("¿Estás seguro de borrar este registro? Esta acción borrará el dinero de las estadísticas de forma permanente.");
    if(confirmar) {
        await deleteDoc(doc(db, "cierres_caja", cierreSeleccionadoId));
        cerrarModal('modal-z'); // Cerrar modal al terminar
    }
});

document.getElementById('form-z').addEventListener('submit', async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "cierres_caja"), {
        fecha: document.getElementById('z-fecha').value,
        responsable: document.getElementById('z-cajero').value,
        venta_efectivo: parseNum(document.getElementById('z-efectivo').value),
        venta_tarjeta_bruta: parseNum(document.getElementById('z-tarjeta').value),
        descripcion: document.getElementById('z-desc').value
    });
    document.getElementById('form-z').reset();
});

// --- INSUMOS / COMPRAS ---
function escucharInsumos() {
    onSnapshot(query(collection(db, "compras"), orderBy("fecha", "desc")), (snapshot) => {
        let insumosSuma = {}; const tbody = document.querySelector('#tabla-compras tbody'); tbody.innerHTML = "";
        snapshot.forEach(doc => {
            const c = doc.data();
            insumosSuma[c.insumo] = (insumosSuma[c.insumo] || 0) + Number(c.cantidad);
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${c.fecha}</td><td>${c.insumo}</td><td>${c.cantidad}</td><td>$${c.costo.toLocaleString('de-DE')}</td><td>${c.descripcion || '-'}</td>`;
            tbody.appendChild(tr);
        });
        if(chartInsumosInstance) chartInsumosInstance.destroy();
        chartInsumosInstance = new Chart(document.getElementById('chartInsumos').getContext('2d'), {
            type: 'bar', data: { labels: Object.keys(insumosSuma), datasets: [{ label: 'Total Comprado', data: Object.values(insumosSuma), backgroundColor: '#1d3557' }] },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
        });
    });
}
document.getElementById('form-compra').addEventListener('submit', async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "compras"), {
        fecha: document.getElementById('compra-fecha').value, insumo: document.getElementById('compra-insumo').value,
        cantidad: Number(document.getElementById('compra-cantidad').value), costo: parseNum(document.getElementById('compra-costo').value),
        descripcion: document.getElementById('compra-desc').value
    });
    document.getElementById('form-compra').reset();
});

// --- GASTOS FIJOS ---
document.getElementById('gasto-concepto').addEventListener('change', (e) => {
    const inputOtro = document.getElementById('gasto-otro');
    e.target.value === 'Otros' ? inputOtro.classList.remove('hidden') : inputOtro.classList.add('hidden');
});
function escucharGastos() {
    onSnapshot(collection(db, "gastos"), (snapshot) => {
        const tbody = document.querySelector('#tabla-gastos tbody'); tbody.innerHTML = "";
        snapshot.forEach(doc => {
            const g = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${g.fecha}</td><td><strong>${g.concepto}</strong></td><td><small>${g.descripcion||'-'}</small></td><td style="color:red">-$${g.monto.toLocaleString('de-DE')}</td>`;
            tbody.appendChild(tr);
        });
    });
}
document.getElementById('form-gasto').addEventListener('submit', async (e) => {
    e.preventDefault();
    let conc = document.getElementById('gasto-concepto').value;
    if(conc === 'Otros') conc = document.getElementById('gasto-otro').value || 'Otros';
    await addDoc(collection(db, "gastos"), {
        fecha: document.getElementById('gasto-fecha').value, concepto: conc,
        monto: parseNum(document.getElementById('gasto-monto').value), descripcion: document.getElementById('gasto-desc').value
    });
    document.getElementById('form-gasto').reset(); document.getElementById('gasto-otro').classList.add('hidden');
});

// --- PERSONAL Y ASISTENCIAS ---
function escucharPersonal() {
    onSnapshot(collection(db, "personal"), (snapshot) => {
        listaEmpleadosGlobales = []; const tbody = document.querySelector('#tabla-personal tbody'); tbody.innerHTML = "";
        snapshot.forEach(doc => {
            const emp = { id: doc.id, ...doc.data() };
            listaEmpleadosGlobales.push(emp);
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${emp.nombre}</td><td>${emp.rut}</td><td>$${emp.tarifa.toLocaleString('de-DE')}</td>`;
            tr.onclick = () => abrirModalEmpleado(emp);
            tbody.appendChild(tr);
        });
    });
}
document.getElementById('form-empleado').addEventListener('submit', async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "personal"), { nombre: document.getElementById('emp-nombre').value, rut: document.getElementById('emp-rut').value, tarifa: parseNum(document.getElementById('emp-tarifa').value) });
    document.getElementById('form-empleado').reset();
});

let datosAsistencias = [];
function escucharAsistencias() {
    onSnapshot(collection(db, "asistencias"), (snapshot) => {
        datosAsistencias = []; snapshot.forEach(doc => datosAsistencias.push(doc.data()));
        if(empleadoSeleccionadoId) pintarAsistenciasEnModal(); // Actualiza si está abierto
    });
}
function abrirModalEmpleado(emp) {
    empleadoSeleccionadoId = emp.id;
    document.getElementById('modal-emp-nombre').innerText = emp.nombre;
    document.getElementById('modal-emp-rut').innerText = emp.rut;
    document.getElementById('modal-emp-tarifa').innerText = emp.tarifa.toLocaleString('de-DE');
    document.getElementById('modal-emp').classList.remove('hidden');
    pintarAsistenciasEnModal();
}
function pintarAsistenciasEnModal() {
    const tbody = document.querySelector('#tabla-asistencias tbody'); tbody.innerHTML = "";
    const misAsistencias = datosAsistencias.filter(a => a.empId === empleadoSeleccionadoId).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    
    const empData = listaEmpleadosGlobales.find(e => e.id === empleadoSeleccionadoId);
    let diasTrabajados = misAsistencias.length;
    
    misAsistencias.forEach(a => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${a.fecha}</td><td style="color:green;"><i class="fa-solid fa-check"></i> Presente</td>`;
        tbody.appendChild(tr);
    });
    
    document.getElementById('modal-emp-total').innerText = (diasTrabajados * empData.tarifa).toLocaleString('de-DE');
}

document.getElementById('btn-marcar-asistencia').addEventListener('click', async () => {
    const tzHoy = new Date().toISOString().split('T')[0];
    const yaMarco = datosAsistencias.find(a => a.empId === empleadoSeleccionadoId && a.fecha === tzHoy);
    if(yaMarco) { alert("Este empleado ya tiene asistencia marcada para el día de hoy."); return; }
    
    await addDoc(collection(db, "asistencias"), { empId: empleadoSeleccionadoId, fecha: tzHoy, timestamp: new Date() });
});

// --- LÓGICA DE AUTOCOMPLETADO INTELIGENTE PARA EL RESPONSABLE (CIERRE Z) ---

const inputCajero = document.getElementById('z-cajero');
const suggestionsContainer = document.getElementById('z-cajero-suggestions');

if (inputCajero && suggestionsContainer) {
    inputCajero.addEventListener('input', () => {
        const filtro = inputCajero.value.toLowerCase().trim();
        suggestionsContainer.innerHTML = ""; // Limpiar lista anterior
        
        if (!filtro) return; // Si está vacío, no mostrar nada

        // 1. Extraer nombres de cierres anteriores
        const nombresCierres = datosCierresGlobales.map(c => c.responsable);
        
        // 2. Extraer nombres de la lista de personal activo
        const nombresPersonal = listaEmpleadosGlobales.map(e => e.nombre);
        
        // 3. Unir ambas listas y eliminar duplicados para tener nombres únicos
        const todosLosNombres = [...new Set([...nombresCierres, ...nombresPersonal])];

        // 4. Filtrar las coincidencias según lo que va escribiendo el usuario
        const coincidencias = todosLosNombres.filter(nombre => 
            nombre && nombre.toLowerCase().includes(filtro)
        );

        // 5. Crear el menú desplegable visualmente
        coincidencias.forEach(nombre => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<i class="fa-solid fa-user" style="margin-right: 8px; font-size: 12px; opacity: 0.7;"></i> ${nombre}`;
            
            // Al hacer clic en la sugerencia, se autocompleta el campo
            div.addEventListener('click', () => {
                inputCajero.value = nombre;
                suggestionsContainer.innerHTML = ""; // Limpiar sugerencias
            });
            suggestionsContainer.appendChild(div);
        });
    });

    // Cerrar el menú desplegable si el usuario hace clic en cualquier otra parte de la pantalla
    document.addEventListener('click', (e) => {
        if (e.target !== inputCajero && e.target !== suggestionsContainer) {
            suggestionsContainer.innerHTML = "";
        }
    });
}

// --- LÓGICA DEL MENÚ HAMBURGUESA PARA TELÉFONOS ---
const btnMenuMovil = document.getElementById('btn-menu-movil');
const sidebar = document.querySelector('.sidebar');

if (btnMenuMovil && sidebar) {
    // Abrir/Cerrar menú al tocar el botón
    btnMenuMovil.addEventListener('click', (e) => {
        e.stopPropagation(); // Evita que el clic se propague al documento
        sidebar.classList.toggle('abierto');
    });

    // Cerrar el menú si tocas cualquier otra parte de la pantalla
    document.addEventListener('click', (e) => {
        // Si el menú está abierto y el clic NO fue dentro del sidebar ni en el botón
        if (sidebar.classList.contains('abierto') && !sidebar.contains(e.target) && e.target !== btnMenuMovil) {
            sidebar.classList.remove('abierto');
        }
    });
}
