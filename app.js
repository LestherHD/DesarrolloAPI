const API_URL = "https://back-semprivado-umg-h6fkf2bng2avgrgw.westus3-01.azurewebsites.net/api";

const REGEX_CARNE = /^\d{4}-\d{2}-\d{5}$/;
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_PIN = /^\d+$/;

let usuarioActivo = JSON.parse(localStorage.getItem("usuarioSession")) || null;
let catalogoVideos = [];
let videoActualId = null;

// Convertidor robusto de YouTube
function formatearUrlYouTube(url) {
    if (!url) return "";
    // Soporte si el profesor guardó únicamente el ID (11 caracteres)
    if (url.length === 11 && !url.includes("http")) return `https://www.youtube.com/embed/${url}`;
    
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : url;
}

function obtenerTipoVideo(url) {
    if (!url) return "";
    const extension = url.split(/[?#]/)[0].split(".").pop().toLowerCase();
    const tipos = { mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg", ogv: "video/ogg" };
    return tipos[extension] || "";
}

document.addEventListener("DOMContentLoaded", () => {
    actualizarInterfazUsuario();
    obtenerCategorias();
    obtenerVideos();

    document.getElementById("searchInput").addEventListener("input", buscarVideo);
    document.getElementById("categoryFilter").addEventListener("change", filtrarPorCategoria);
    document.getElementById("formRegistro").addEventListener("submit", registrarEstudiante);
    document.getElementById("formLogin").addEventListener("submit", iniciarSesion);

    // Apagar el video al cerrar el modal para que no siga sonando
    document.getElementById("videoModal").addEventListener("hidden.bs.modal", () => {
        document.getElementById("videoMediaContainer").innerHTML = ""; 
    });
});

function actualizarInterfazUsuario() {
    const authContainer = document.getElementById("authContainer");
    if (usuarioActivo) {
        const identificador = usuarioActivo.carne || "Estudiante";
        authContainer.innerHTML = `
            <span class="text-light small">Sesión: <b class="text-info">${identificador}</b></span>
            <button class="btn btn-sm btn-outline-danger" onclick="cerrarSesion()">Cerrar Sesión</button>
        `;
    } else {
        authContainer.innerHTML = `
            <button class="btn btn-sm btn-outline-light" data-bs-toggle="modal" data-bs-target="#loginModal">Iniciar Sesión</button>
            <button class="btn btn-sm btn-primary" data-bs-toggle="modal" data-bs-target="#registroModal">Registrarse</button>
        `;
    }
}

async function registrarEstudiante(e) {
    e.preventDefault();
    const carne = document.getElementById("regCarne").value.trim();
    const estudiante = document.getElementById("regNombre").value.trim();
    const correo = document.getElementById("regCorreo").value.trim();
    const password = document.getElementById("regPin").value.trim();

    if (!REGEX_CARNE.test(carne)) return alert("El carné debe cumplir estrictamente con el formato: 9999-99-99999");
    if (!REGEX_CORREO.test(correo)) return alert("Formato de correo electrónico inválido");
    if (!REGEX_PIN.test(password)) return alert("La contraseña debe ser un PIN estrictamente numérico");

    try {
        const respuesta = await fetch(`${API_URL}/estudiantes/registrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carne, estudiante, correo, password })
        });

        if (respuesta.ok) {
            alert("Estudiante registrado exitosamente. Ya puedes iniciar sesión.");
            bootstrap.Modal.getInstance(document.getElementById("registroModal")).hide();
            document.getElementById("formRegistro").reset();
        } else {
            alert("Error: Carné o correo ya registrado.");
        }
    } catch (error) {
        console.error("Error al registrar:", error);
    }
}

async function iniciarSesion(e) {
    e.preventDefault();
    const usuario = document.getElementById("loginUsuario").value.trim();
    const password = document.getElementById("loginPin").value.trim();

    try {
        const respuesta = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, password })
        });

        if (respuesta.ok) {
            let data = {};
            try { data = await respuesta.json(); } catch(err) {} 
            
            let carneFinal = data.carne || data.carnet || (REGEX_CARNE.test(usuario) ? usuario : null);

            if (!carneFinal) carneFinal = prompt("Ingresa tu carné para asociar tus interacciones (ej: 1890-20-11489):");

            usuarioActivo = { carne: carneFinal, nombre: data.estudiante || carneFinal };
            localStorage.setItem("usuarioSession", JSON.stringify(usuarioActivo));
            
            bootstrap.Modal.getInstance(document.getElementById("loginModal")).hide();
            document.getElementById("formLogin").reset();
            actualizarInterfazUsuario();
            
            if (videoActualId) cargarDetalleVideo(videoActualId);
        } else {
            alert("Credenciales incorrectas.");
        }
    } catch (error) {
        console.error("Error en login:", error);
    }
}

function cerrarSesion() {
    usuarioActivo = null;
    localStorage.removeItem("usuarioSession");
    actualizarInterfazUsuario();
    if (videoActualId) cargarDetalleVideo(videoActualId);
}

async function obtenerVideos() {
    try {
        const respuesta = await fetch(`${API_URL}/videos`);
        catalogoVideos = await respuesta.json();
        renderizarGrid(catalogoVideos);
    } catch (error) {
        console.error("Error al cargar videos:", error);
    }
}

async function obtenerCategorias() {
    try {
        const respuesta = await fetch(`${API_URL}/videos/categorias`);
        const categorias = await respuesta.json();
        const select = document.getElementById("categoryFilter");
        select.innerHTML = `<option value="ALL">Todas las Categorías</option>`;
        
        categorias.forEach(cat => {
            const nombreCat = typeof cat === 'string' ? cat : (cat.nombre || cat.categoria);
            select.innerHTML += `<option value="${encodeURIComponent(nombreCat)}">${nombreCat}</option>`;
        });
    } catch (error) {
        console.error("Error al cargar categorías:", error);
    }
}

async function filtrarPorCategoria(e) {
    const categoria = e.target.value;
    if (categoria === "ALL") return renderizarGrid(catalogoVideos);
    
    try {
        const respuesta = await fetch(`${API_URL}/videos/categoria/${categoria}`);
        const filtrados = await respuesta.json();
        renderizarGrid(filtrados);
    } catch (error) {
        console.error("Error al filtrar por categoría:", error);
    }
}

function buscarVideo() {
    const texto = document.getElementById("searchInput").value.toLowerCase().trim();
    const filtrados = catalogoVideos.filter(v => v.titulo && v.titulo.toLowerCase().includes(texto));
    renderizarGrid(filtrados);
}

function renderizarGrid(videos) {
    const grid = document.getElementById("videoGrid");
    grid.innerHTML = "";
    
    if (!videos || videos.length === 0) {
        grid.innerHTML = `<div class="col-12 text-center text-muted py-5">No se encontraron videos disponibles.</div>`;
        return;
    }

    videos.forEach(video => {
        // EXTRACCIÓN BLINDADA DEL ID: Soporta _id, videoId, id_video
        const idVideo = video.id || video._id || video.videoId || video.idVideo || video.id_video;
        const posterUrl = video.poster || video.imagen || 'https://via.placeholder.com/400x225/1A2330/ffffff?text=Video+Educativo';
        
        grid.innerHTML += `
            <div class="col-12 col-md-6 col-lg-4">
                <div class="card h-100 shadow-sm" style="cursor: pointer;" onclick="abrirModal('${idVideo}')">
                    <img src="${posterUrl}" class="card-img-top video-thumbnail" alt="Poster del video">
                    <div class="card-body d-flex flex-column justify-content-between">
                        <div>
                            <h6 class="card-title text-light mb-1">${video.titulo}</h6>
                            <p class="card-text small text-secondary text-truncate">${video.descripcion || "Sin descripción disponible."}</p>
                        </div>
                        <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top border-secondary">
                            <span class="badge bg-primary text-truncate" style="max-width: 140px;">${video.categoria || "General"}</span>
                            <span class="badge bg-dark border border-secondary text-light"><i class="bi bi-clock me-1"></i>${video.duracion || "N/A"}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

function abrirModal(id) {
    if (id === 'undefined') return alert('Error: El video no tiene un ID válido asignado en la base de datos.');
    videoActualId = id;
    cargarDetalleVideo(id);
    const modal = bootstrap.Modal.getInstance(document.getElementById("videoModal")) || new bootstrap.Modal(document.getElementById("videoModal"));
    modal.show();
}

async function cargarDetalleVideo(id) {
    try {
        const respuesta = await fetch(`${API_URL}/videos/${id}`);
        const video = await respuesta.json();

        document.getElementById("videoTitle").innerText = video.titulo || "Video";
        document.getElementById("videoCategory").innerText = video.categoria || "General";
        document.getElementById("videoDescription").innerText = video.descripcion || "";

        // Extracción exhaustiva para atrapar la URL sin importar cómo la llame la API
        const videoUrl = video.url || video.urlVideo || video.videoUrl || video.url_video || video.enlace || video.link || video.src || "";
        const container = document.getElementById("videoMediaContainer");

        if (!videoUrl) {
            container.innerHTML = `<div class="d-flex align-items-center justify-content-center h-100 text-muted">No hay URL de video disponible en los datos.</div>`;
        } else if (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be") || videoUrl.length === 11) {
            const embedUrl = formatearUrlYouTube(videoUrl);
            const separador = embedUrl.includes("?") ? "&" : "?";
            container.innerHTML = `<iframe src="${embedUrl}${separador}autoplay=1" title="Reproductor" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" class="w-100 h-100 border-0"></iframe>`;
        } else {
            const tipoVideo = obtenerTipoVideo(videoUrl);
            const atributoTipo = tipoVideo ? ` type="${tipoVideo}"` : "";
            container.innerHTML = `<video controls autoplay playsinline class="w-100 h-100" onerror="mostrarErrorVideo()"><source src="${videoUrl}"${atributoTipo}>Tu navegador no puede reproducir este formato de video.</video>`;
        }

        const btnLike = document.getElementById("btnLike");
        document.getElementById("likeCount").innerText = video.likes || 0;

        if (usuarioActivo && usuarioActivo.carne) {
            btnLike.disabled = false;
            btnLike.classList.remove("opacity-50");
        } else {
            btnLike.disabled = true;
            btnLike.classList.add("opacity-50");
        }

        renderizarComentarios(video.comentarios || []);
    } catch (error) {
        console.error("Error al obtener detalle del video:", error);
    }
}

function mostrarErrorVideo() {
    const container = document.getElementById("videoMediaContainer");
    container.innerHTML = `<div class="d-flex align-items-center justify-content-center h-100 text-muted text-center px-3">No se pudo cargar este video. Comprueba que la URL siga disponible.</div>`;
}

async function toggleLike() {
    if (!usuarioActivo || !usuarioActivo.carne) return alert("Debes iniciar sesión.");
    try {
        await fetch(`${API_URL}/interaccionvideo/${videoActualId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carne: usuarioActivo.carne })
        });
        cargarDetalleVideo(videoActualId);
    } catch (error) { console.error("Error en like:", error); }
}

function renderizarComentarios(comentarios) {
    const formArea = document.getElementById("commentFormArea");
    const lista = document.getElementById("commentsList");

    if (usuarioActivo) {
        formArea.innerHTML = `
            <div class="d-flex gap-2">
                <input type="text" id="txtNuevoComentario" class="form-control form-control-sm" placeholder="Añadir comentario...">
                <button class="btn btn-sm btn-primary px-3" onclick="publicarComentario()">Publicar</button>
            </div>
        `;
    } else {
        formArea.innerHTML = `
            <div class="alert alert-secondary small py-2 d-flex justify-content-between align-items-center mb-0">
                <span><i class="bi bi-lock me-1"></i> Inicia sesión para comentar.</span>
                <button class="btn btn-sm btn-outline-light" data-bs-toggle="modal" data-bs-target="#loginModal">Ingresar</button>
            </div>
        `;
    }

    lista.innerHTML = "";
    if (comentarios.length === 0) return lista.innerHTML = `<p class="small text-muted my-2">No hay comentarios en este video.</p>`;

    comentarios.forEach(com => {
        const idCom = com.id || com._id;
        const puedeEliminar = usuarioActivo && (usuarioActivo.carne === com.carne);
        const botonBorrar = puedeEliminar ? `<button class="btn btn-link text-danger p-0 ms-2 small text-decoration-none" onclick="eliminarComentario('${idCom}')"><i class="bi bi-trash"></i></button>` : '';
        const botonResponder = usuarioActivo ? `<button class="btn btn-link text-info p-0 small text-decoration-none" onclick="mostrarInputRespuesta('${idCom}')">Responder</button>` : '';

        lista.innerHTML += `
            <div class="comment-box border border-secondary mb-2">
                <div class="d-flex justify-content-between align-items-center">
                    <span class="text-info small fw-bold">${com.carne}</span>
                    <div>${botonResponder} ${botonBorrar}</div>
                </div>
                <p class="mb-1 small text-light">${com.texto}</p>
                <div id="cajaResp_${idCom}" class="mt-2"></div>
                <div class="reply-box mt-2">
                    ${(com.respuestas || []).map(resp => {
                        const puedeBorrarResp = usuarioActivo && (usuarioActivo.carne === resp.carne);
                        return `
                            <div class="mb-2">
                                <div class="d-flex justify-content-between align-items-center">
                                    <span class="text-secondary small fw-bold">${resp.carne}</span>${puedeBorrarResp ? `<button class="btn btn-link text-danger p-0 small text-decoration-none" onclick="eliminarComentario('${resp.id || resp._id}')"><i class="bi bi-trash"></i></button>` : ''}
                                </div>
                                <p class="mb-0 small text-light">${resp.texto}</p>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    });
}

async function publicarComentario() {
    const input = document.getElementById("txtNuevoComentario");
    if (!input.value.trim()) return;
    try {
        await fetch(`${API_URL}/interaccionvideo/${videoActualId}/comentario`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carne: usuarioActivo.carne, texto: input.value.trim() })
        });
        cargarDetalleVideo(videoActualId);
    } catch (e) {}
}

function mostrarInputRespuesta(id) {
    document.getElementById(`cajaResp_${id}`).innerHTML = `
        <div class="d-flex gap-2 mt-2">
            <input type="text" id="txtResp_${id}" class="form-control form-control-sm" placeholder="Respuesta...">
            <button class="btn btn-sm btn-secondary" onclick="publicarRespuesta('${id}')">Enviar</button>
        </div>
    `;
}

async function publicarRespuesta(id) {
    const input = document.getElementById(`txtResp_${id}`);
    if (!input.value.trim()) return;
    try {
        await fetch(`${API_URL}/interaccionvideo/comentario/${id}/responder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carne: usuarioActivo.carne, texto: input.value.trim() })
        });
        cargarDetalleVideo(videoActualId);
    } catch (e) {}
}

async function eliminarComentario(id) {
    if (!confirm("¿Eliminar comentario?")) return;
    try {
        const respuesta = await fetch(`${API_URL}/interaccionvideo/comentario/${id}?carne=${usuarioActivo.carne}`, { method: 'DELETE' });
        if (respuesta.status === 403) alert("No tienes autorización para eliminar comentarios de otros.");
        else cargarDetalleVideo(videoActualId);
    } catch (e) {}
}