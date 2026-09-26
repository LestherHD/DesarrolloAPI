const API_URL = "https://back-semprivado-umg-h6fkf2bng2avgrgw.westus3-01.azurewebsites.net/api";

// Reglas de validación (Serie I)
const REGEX_CARNE = /^\d{4}-\d{2}-\d{5}$/;
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_PIN = /^\d+$/;

// Estado global de la aplicación
let usuarioActivo = JSON.parse(localStorage.getItem("usuarioSession")) || null;
let catalogoVideos = [];
let videoActualId = null;

// Conversor de enlace normal de YouTube a formato incrustable (embed)
function formatearUrlYouTube(url) {
    if (!url) return "";
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) 
        ? `https://www.youtube.com/embed/${match[2]}` 
        : url;
}

document.addEventListener("DOMContentLoaded", () => {
    actualizarInterfazUsuario();
    obtenerCategorias();
    obtenerVideos();

    // Filtros y Búsqueda en tiempo real (Serie II)
    document.getElementById("searchInput").addEventListener("input", buscarVideo);
    document.getElementById("categoryFilter").addEventListener("change", filtrarPorCategoria);
    
    // Formularios (Serie I)
    document.getElementById("formRegistro").addEventListener("submit", registrarEstudiante);
    document.getElementById("formLogin").addEventListener("submit", iniciarSesion);

    // Detener reproducción al cerrar el modal
    const videoModalEl = document.getElementById("videoModal");
    videoModalEl.addEventListener("hidden.bs.modal", () => {
        const iframe = document.getElementById("videoIframe");
        if (iframe) iframe.src = "";
    });
});

// ==========================================
// SERIE I: AUTENTICACIÓN
// ==========================================

function actualizarInterfazUsuario() {
    const authContainer = document.getElementById("authContainer");
    if (usuarioActivo) {
        const identificador = usuarioActivo.carne || usuarioActivo.estudiante || usuarioActivo.correo || "Estudiante";
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
            alert("Error: Carné o correo ya registrado en el sistema.");
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
            const data = await respuesta.json();
            
            let carneFinal = data.carne || data.carnet || (REGEX_CARNE.test(usuario) ? usuario : null);

            if (!carneFinal) {
                carneFinal = prompt("Ingresa tu carné para asociar tus interacciones (ej: 1890-20-11489):");
            }

            usuarioActivo = {
                carne: carneFinal,
                nombre: data.estudiante || data.nombre || carneFinal
            };
            
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

// ==========================================
// SERIE II: CATÁLOGO, BÚSQUEDA Y NAVEGACIÓN
// ==========================================

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
    if (categoria === "ALL") {
        renderizarGrid(catalogoVideos);
        return;
    }
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
        const idVideo = video.id || video._id;
        const posterUrl = video.poster || 'https://via.placeholder.com/400x225/1A2330/ffffff?text=Video+Educativo';
        
        grid.innerHTML += `
            <div class="col-12 col-md-6 col-lg-4">
                <div class="card h-100 shadow-sm" style="cursor: pointer;" onclick="abrirModal('${idVideo}')">
                    <img src="${posterUrl}" class="card-img-top video-thumbnail" alt="${video.titulo}">
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
    videoActualId = id;
    cargarDetalleVideo(id);
    const modalEl = document.getElementById("videoModal");
    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modal.show();
}

async function cargarDetalleVideo(id) {
    try {
        const respuesta = await fetch(`${API_URL}/videos/${id}`);
        const video = await respuesta.json();

        document.getElementById("videoTitle").innerText = video.titulo || "Video";
        document.getElementById("videoCategory").innerText = video.categoria || "General";
        document.getElementById("videoDescription").innerText = video.descripcion || "";
        
        // Inyectar el video de YouTube en el iframe
        const iframe = document.getElementById("videoIframe");
        if (iframe) {
            iframe.src = formatearUrlYouTube(video.url);
        }
        
        // Control de acceso visual
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

// ==========================================
// SERIE III: LÓGICA DE INTERACCIÓN
// ==========================================

async function toggleLike() {
    if (!usuarioActivo || !usuarioActivo.carne) {
        return alert("Debes iniciar sesión con un carné válido.");
    }
    
    try {
        const respuesta = await fetch(`${API_URL}/interaccionvideo/${videoActualId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carne: usuarioActivo.carne })
        });

        if (respuesta.ok) {
            cargarDetalleVideo(videoActualId);
        } else {
            alert(`Error del servidor (Status ${respuesta.status}).`);
        }
    } catch (error) {
        console.error("Error de red en like:", error);
    }
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
                <span><i class="bi bi-lock me-1"></i> Debes iniciar sesión para comentar.</span>
                <button class="btn btn-sm btn-outline-light" data-bs-toggle="modal" data-bs-target="#loginModal">Ingresar</button>
            </div>
        `;
    }

    lista.innerHTML = "";
    if (comentarios.length === 0) {
        lista.innerHTML = `<p class="small text-muted my-2">No hay comentarios en este video.</p>`;
        return;
    }

    comentarios.forEach(com => {
        const idCom = com.id || com._id;
        const puedeEliminar = usuarioActivo && (usuarioActivo.carne === com.carne);
        
        const botonBorrar = puedeEliminar 
            ? `<button class="btn btn-link text-danger p-0 ms-2 small text-decoration-none" onclick="eliminarComentario('${idCom}')"><i class="bi bi-trash"></i></button>` : '';
        const botonResponder = usuarioActivo 
            ? `<button class="btn btn-link text-info p-0 small text-decoration-none" onclick="mostrarInputRespuesta('${idCom}')">Responder</button>` : '';

        lista.innerHTML += `
            <div class="comment-box border border-secondary mb-2">
                <div class="d-flex justify-content-between align-items-center">
                    <span class="text-info small fw-bold">${com.carne}</span>
                    <div>${botonResponder} ${botonBorrar}</div>
                </div>
                <p class="mb-1 small text-light">${com.texto}</p>
                <div id="cajaResp_${idCom}" class="mt-2"></div>
                
                <!-- Hilos Anidados (1er nivel) -->
                <div class="reply-box mt-2">
                    ${(com.respuestas || []).map(resp => {
                        const idResp = resp.id || resp._id;
                        const puedeBorrarResp = usuarioActivo && (usuarioActivo.carne === resp.carne);
                        return `
                            <div class="mb-2">
                                <div class="d-flex justify-content-between align-items-center">
                                    <span class="text-secondary small fw-bold">${resp.carne}</span>${puedeBorrarResp ? `<button class="btn btn-link text-danger p-0 small text-decoration-none" onclick="eliminarComentario('${idResp}')"><i class="bi bi-trash"></i></button>` : ''}
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
    if (!usuarioActivo || !usuarioActivo.carne) {
        return alert("Debes iniciar sesión con un carné válido.");
    }

    const input = document.getElementById("txtNuevoComentario");
    const texto = input.value.trim();
    if (!texto) return alert("Escribe un texto antes de publicar.");

    try {
        const respuesta = await fetch(`${API_URL}/interaccionvideo/${videoActualId}/comentario`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carne: usuarioActivo.carne, texto })
        });
        
        if (respuesta.ok) {
            input.value = "";
            cargarDetalleVideo(videoActualId);
        } else {
            alert(`Error del servidor (Status ${respuesta.status}).`);
        }
    } catch (error) {
        console.error("Error al publicar comentario:", error);
    }
}

function mostrarInputRespuesta(comentarioId) {
    const caja = document.getElementById(`cajaResp_${comentarioId}`);
    caja.innerHTML = `
        <div class="d-flex gap-2 mt-2">
            <input type="text" id="txtResp_${comentarioId}" class="form-control form-control-sm" placeholder="Escribe tu respuesta...">
            <button class="btn btn-sm btn-secondary" onclick="publicarRespuesta('${comentarioId}')">Enviar</button>
        </div>
    `;
}

async function publicarRespuesta(comentarioId) {
    if (!usuarioActivo || !usuarioActivo.carne) return;

    const input = document.getElementById(`txtResp_${comentarioId}`);
    const texto = input.value.trim();
    if (!texto) return;

    try {
        const respuesta = await fetch(`${API_URL}/interaccionvideo/comentario/${comentarioId}/responder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carne: usuarioActivo.carne, texto })
        });

        if (respuesta.ok) {
            cargarDetalleVideo(videoActualId);
        } else {
            alert(`Error del servidor (Status ${respuesta.status}).`);
        }
    } catch (error) {
        console.error("Error al enviar respuesta:", error);
    }
}

async function eliminarComentario(id) {
    if (!confirm("¿Deseas eliminar este comentario?")) return;
    try {
        const respuesta = await fetch(`${API_URL}/interaccionvideo/comentario/${id}?carne=${usuarioActivo.carne}`, {
            method: 'DELETE'
        });
        
        if (respuesta.status === 403) {
            alert("403 Forbidden: No tienes autorización para eliminar comentarios de otros usuarios.");
        } else if (respuesta.ok) {
            cargarDetalleVideo(videoActualId);
        } else {
            alert(`Error al eliminar (Status ${respuesta.status}).`);
        }
    } catch (error) {
        console.error("Error al eliminar comentario:", error);
    }
}
