import * as THREE from '../../assets/vendor/three/three.module.js';

const MANIFEST_URL = new URL('../../assets/anatomy/model/atlas.json', import.meta.url);
const INTEGUMENTARY_SYSTEM = 'integumentary';
const DECODED_CHUNK_CACHE_LIMIT = 3;
const MAX_STRUCTURE_OPTIONS = 50;

export const ANATOMY_MODEL_SYSTEMS = Object.freeze({
    integumentary: ['integumentary'],
    skeletal: ['skeletal'],
    muscular: ['muscular'],
    nervous: ['nervous', 'sensory'],
    endocrine: ['endocrine'],
    cardiovascular: ['cardiac', 'arterial', 'venous'],
    lymphatic: ['lymphatic'],
    respiratory: ['respiratory'],
    digestive: ['digestive'],
    urinary: ['urinary'],
    reproductive: ['reproductive']
});

const MODEL_SYSTEM_NAMES = new Set([
    'skeletal', 'sensory', 'nervous', 'connective', 'muscular', 'arterial', 'cardiac',
    'endocrine', 'venous', 'digestive', 'respiratory', 'lymphatic', 'integumentary',
    'reproductive', 'urinary'
]);

const SYSTEM_COLORS = Object.freeze({
    integumentary: 0xc88770,
    skeletal: 0xc9ad7b,
    muscular: 0xa65f58,
    nervous: 0xd6b34f,
    endocrine: 0xb98655,
    cardiovascular: 0xb84e4e,
    lymphatic: 0x688d69,
    respiratory: 0x5d9998,
    digestive: 0xb9784b,
    urinary: 0x658bab,
    reproductive: 0x98738b
});

let manifestPromise = null;
const decodedChunkBuffers = new Map();
const chunkLoads = new Map();

export function getAnatomyModelSystems(systemId) {
    const systems = ANATOMY_MODEL_SYSTEMS[systemId];
    if (!systems) throw new RangeError('Unknown anatomy system: ' + systemId);
    return [...systems];
}

export function getAnatomyModelConcepts(manifest, systemId) {
    validateAnatomyManifest(manifest);
    const visibleSystems = new Set(getAnatomyModelSystems(systemId));
    const visibleParts = new Map(manifest.parts
        .filter((part) => visibleSystems.has(part.system))
        .map((part) => [part.id, part]));
    return manifest.concepts.map((concept) => ({
        id: concept.id,
        name: concept.name.charAt(0).toLocaleUpperCase() + concept.name.slice(1),
        elements: [...concept.elements],
        visibleElements: concept.elements.map((id) => visibleParts.get(id)).filter(Boolean)
    })).filter((concept) => concept.visibleElements.length)
        .sort((first, second) => first.name.localeCompare(second.name));
}

export function getAnatomyModelChunks(manifest, systemId) {
    validateAnatomyManifest(manifest);
    const systems = new Set(getAnatomyModelSystems(systemId));
    systems.add(INTEGUMENTARY_SYSTEM);
    return [...new Set(manifest.parts
        .filter((part) => systems.has(part.system))
        .map((part) => part.chunk))]
        .sort((first, second) => first - second);
}

export function validateAnatomyManifest(manifest) {
    if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.parts) || !manifest.parts.length
        || !Array.isArray(manifest.chunks) || !manifest.chunks.length
        || !Array.isArray(manifest.concepts) || !manifest.concepts.length) {
        throw new TypeError('The anatomy model manifest is missing required data.');
    }

    for (const [index, chunk] of manifest.chunks.entries()) {
        if (!chunk || !Number.isSafeInteger(chunk.bytes) || chunk.bytes < 1
            || !Number.isSafeInteger(chunk.gzipBytes) || chunk.gzipBytes < 1
            || typeof chunk.gzip !== 'string') {
            throw new TypeError('The anatomy model contains an invalid chunk at index ' + index + '.');
        }
    }

    const partIds = new Set();
    for (const [index, part] of manifest.parts.entries()) {
        if (!part || typeof part.id !== 'string' || !part.id || typeof part.name !== 'string' || !part.name
            || !MODEL_SYSTEM_NAMES.has(part.system) || !Number.isSafeInteger(part.chunk)
            || part.chunk < 0 || part.chunk >= manifest.chunks.length
            || !Number.isSafeInteger(part.vertexCount) || part.vertexCount < 1
            || !Number.isSafeInteger(part.indexCount) || part.indexCount < 3
            || part.indexCount % 3 !== 0) {
            throw new TypeError('The anatomy model contains an invalid structure at index ' + index + '.');
        }
        if (partIds.has(part.id)) throw new TypeError('The anatomy model contains a duplicate structure id: ' + part.id + '.');
        partIds.add(part.id);
        const chunk = manifest.chunks[part.chunk];
        const fields = [
            ['positions', part.vertexCount * 12, 4],
            ['normals', part.vertexCount * 6, 2],
            ['indices', part.indexCount * 4, 4]
        ];
        for (const [field, byteLength, alignment] of fields) {
            const offset = part[field];
            if (!Number.isSafeInteger(offset) || offset < 0 || offset % alignment !== 0
                || offset + byteLength > chunk.bytes) {
                throw new TypeError('The anatomy model contains an invalid ' + field + ' range for structure ' + part.id + '.');
            }
        }
    }
    const conceptIds = new Set();
    for (const [index, concept] of manifest.concepts.entries()) {
        if (!concept || typeof concept.id !== 'string' || !concept.id || typeof concept.name !== 'string' || !concept.name
            || !Array.isArray(concept.elements) || !concept.elements.length
            || concept.elements.some((id) => typeof id !== 'string' || !partIds.has(id))) {
            throw new TypeError('The anatomy model contains an invalid named concept at index ' + index + '.');
        }
        if (conceptIds.has(concept.id)) throw new TypeError('The anatomy model contains a duplicate concept id: ' + concept.id + '.');
        conceptIds.add(concept.id);
    }
    return true;
}

async function getManifest() {
    if (!manifestPromise) {
        manifestPromise = fetch(MANIFEST_URL).then(async (response) => {
            if (!response.ok) throw new Error('The anatomy model description could not be loaded.');
            const manifest = await response.json();
            validateAnatomyManifest(manifest);
            return manifest;
        }).catch((error) => {
            manifestPromise = null;
            throw error;
        });
    }
    return manifestPromise;
}

function rememberChunk(index, buffer) {
    decodedChunkBuffers.delete(index);
    decodedChunkBuffers.set(index, buffer);
    while (decodedChunkBuffers.size > DECODED_CHUNK_CACHE_LIMIT) {
        decodedChunkBuffers.delete(decodedChunkBuffers.keys().next().value);
    }
    return buffer;
}

async function getChunkBuffer(manifest, index) {
    if (decodedChunkBuffers.has(index)) {
        const buffer = decodedChunkBuffers.get(index);
        decodedChunkBuffers.delete(index);
        decodedChunkBuffers.set(index, buffer);
        return buffer;
    }
    if (chunkLoads.has(index)) return chunkLoads.get(index);

    const chunk = manifest.chunks[index];
    const promise = (async () => {
        const url = new URL(chunk.gzip, MANIFEST_URL);
        const response = await fetch(url);
        if (!response.ok) throw new Error('An anatomy model file could not be loaded.');
        const payload = await response.arrayBuffer();
        const bytes = new Uint8Array(payload);
        const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
        let buffer = payload;
        if (isGzip) {
            if (typeof DecompressionStream !== 'function') {
                throw new Error('This browser does not support the compressed anatomy model format.');
            }
            buffer = await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        }
        const payloadSizeMatches = payload.byteLength === chunk.gzipBytes || payload.byteLength === chunk.bytes;
        if (!payloadSizeMatches || buffer.byteLength !== chunk.bytes) {
            throw new Error('An anatomy model file was incomplete. Reload the viewer and try again.');
        }
        return rememberChunk(index, buffer);
    })().finally(() => chunkLoads.delete(index));
    chunkLoads.set(index, promise);
    return promise;
}

function setStatus(root, message) {
    const status = root.querySelector('[data-anatomy-status]');
    if (status) status.textContent = message;
}

function showError(root, message) {
    const error = root.querySelector('[data-anatomy-error]');
    if (error) {
        error.textContent = message;
        error.classList.remove('hidden');
    }
    setStatus(root, '3D model unavailable. The text review is still available.');
}

function createMaterial(color, options = {}) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.88,
        metalness: 0,
        side: THREE.DoubleSide,
        ...options
    });
}

function createPartMesh(part, buffer, material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array(buffer, part.positions, part.vertexCount * 3), 3
    ));
    geometry.setAttribute('normal', new THREE.Int16BufferAttribute(
        new Int16Array(buffer, part.normals, part.vertexCount * 3), 3, true
    ));
    geometry.setIndex(new THREE.BufferAttribute(
        new Uint32Array(buffer, part.indices, part.indexCount), 1
    ));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.part = part;
    return mesh;
}

function createStructureOption(documentRef, part) {
    const option = documentRef.createElement('option');
    option.value = part.id;
    option.textContent = part.name;
    return option;
}

export function mountAnatomyViewer(root, systemId) {
    const canvasHost = root.querySelector('[data-anatomy-canvas-host]');
    const error = root.querySelector('[data-anatomy-error]');
    const search = root.querySelector('[data-anatomy-search]');
    const select = root.querySelector('[data-anatomy-structure]');
    const searchStatus = root.querySelector('[data-anatomy-search-status]');
    const selectionStatus = root.querySelector('[data-anatomy-selection]');
    if (!canvasHost || !search || !select) return { dispose() {} };

    let disposed = false;
    let renderer;
    let resizeObserver;
    let modelGroup;
    let selectedConceptId = '';
    let modelReady = false;
    let selectedMeshes = new Set();
    let searchableConcepts = [];
    let conceptMapById = new Map();
    let meshByPartId = new Map();
    let materialBySystem = new Map();
    let surfaceMaterial;
    let highlightMaterial;
    let radius = 1;
    let distance = 3;
    let yaw = 0;
    let polar = Math.PI / 2 - 0.1;
    let target = new THREE.Vector3(0, 0.9, 0);
    let pointerDown = null;
    let previousPinchDistance = 0;
    const pointers = new Map();
    const raycaster = new THREE.Raycaster();
    const pointerPosition = new THREE.Vector2();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);

    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
        showError(root, 'Your browser could not start the 3D view. The text anatomy review remains available.');
        return { dispose() {} };
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = 'block h-full w-full';
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D adult male reference model of the ' + (root.dataset.systemName || 'selected body system') + '. Use the structure search and selector for keyboard access.');
    renderer.domElement.style.touchAction = 'none';
    canvasHost.replaceChildren(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x77736e, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(2, 3, 4);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.9);
    fillLight.position.set(-3, 1, -2);
    scene.add(fillLight);
    modelGroup = new THREE.Group();
    scene.add(modelGroup);

    surfaceMaterial = createMaterial(0x8b8d8b, { transparent: true, opacity: 0.2, depthWrite: false });
    highlightMaterial = createMaterial(0xffa247, { emissive: 0x552700, roughness: 0.7 });

    const updateCamera = () => {
        const sinPolar = Math.sin(polar);
        camera.position.set(
            target.x + distance * sinPolar * Math.sin(yaw),
            target.y + distance * Math.cos(polar),
            target.z + distance * sinPolar * Math.cos(yaw)
        );
        camera.lookAt(target);
        renderer.render(scene, camera);
    };
    const resize = () => {
        if (disposed || !renderer) return;
        const bounds = canvasHost.getBoundingClientRect();
        const width = Math.floor(bounds.width);
        const height = Math.floor(bounds.height);
        if (width < 1 || height < 1) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        updateCamera();
    };
    if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvasHost);
    } else {
        window.addEventListener('resize', resize);
    }
    resize();

    const setSelectionText = (concept, visibleCount = 0) => {
        if (selectionStatus) selectionStatus.textContent = concept
            ? 'Selected: ' + concept.name + '. ' + visibleCount + ' of ' + concept.elements.length + ' related model part' + (concept.elements.length === 1 ? '' : 's') + ' shown in this system.'
            : 'Select a structure below or click a visible structure in the model.';
    };
    const clearSelection = () => {
        for (const mesh of selectedMeshes) mesh.material = mesh.userData.defaultMaterial;
        selectedMeshes = new Set();
    };
    const selectConcept = (concept, moveCamera = false) => {
        clearSelection();
        if (!concept) {
            selectedConceptId = '';
            select.value = '';
            setSelectionText(null);
            updateCamera();
            return;
        }
        selectedConceptId = concept.id;
        select.value = concept.id;
        const meshes = concept.visibleElements.map((part) => meshByPartId.get(part.id)).filter(Boolean);
        for (const mesh of meshes) {
            mesh.material = highlightMaterial;
            selectedMeshes.add(mesh);
        }
        if (moveCamera && meshes.length) {
            const bounds = new THREE.Box3();
            for (const mesh of meshes) bounds.expandByObject(mesh);
            const sphere = bounds.getBoundingSphere(new THREE.Sphere());
            target.copy(sphere.center);
            distance = Math.max(sphere.radius * 4.5, radius * 0.12);
        }
        setSelectionText(concept, meshes.length);
        updateCamera();
    };
    const updateStructureOptions = () => {
        const query = search.value.trim().toLocaleLowerCase();
        const matches = searchableConcepts.filter((concept) => concept.name.toLocaleLowerCase().includes(query));
        const shown = matches.slice(0, MAX_STRUCTURE_OPTIONS);
        const fragment = document.createDocumentFragment();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = shown.length ? 'Choose a structure' : 'No matching structures';
        fragment.append(placeholder);
        for (const concept of shown) fragment.append(createStructureOption(document, concept));
        select.replaceChildren(fragment);
        select.disabled = shown.length === 0 || !modelReady;
        if (selectedConceptId && shown.some((concept) => concept.id === selectedConceptId)) select.value = selectedConceptId;
        if (searchStatus) {
            searchStatus.textContent = matches.length > MAX_STRUCTURE_OPTIONS
                ? 'Showing the first ' + MAX_STRUCTURE_OPTIONS + ' of ' + matches.length + ' matches. Add more letters to narrow the list.'
                : matches.length + ' matching anatomy concept' + (matches.length === 1 ? '.' : 's.');
        }
    };
    const zoom = (factor) => {
        distance = THREE.MathUtils.clamp(distance * factor, radius * 0.08, radius * 7);
        updateCamera();
    };
    const resetView = () => {
        yaw = 0;
        polar = Math.PI / 2 - 0.1;
        if (modelGroup.children.length) {
            const bounds = new THREE.Box3().setFromObject(modelGroup);
            const sphere = bounds.getBoundingSphere(new THREE.Sphere());
            target.copy(sphere.center);
            radius = Math.max(sphere.radius, 0.12);
        }
        distance = radius * 4.1;
        updateCamera();
    };
    const onControlClick = (event) => {
        const button = event.target.closest('[data-viewer-action]');
        if (!button) return;
        const action = button.dataset.viewerAction;
        if (action === 'rotate-left') yaw -= 0.28;
        else if (action === 'rotate-right') yaw += 0.28;
        else if (action === 'zoom-in') zoom(0.82);
        else if (action === 'zoom-out') zoom(1.22);
        else if (action === 'reset') resetView();
        updateCamera();
    };
    const onSelectChange = () => {
        selectConcept(conceptMapById.get(select.value), true);
    };
    const onSearchInput = () => updateStructureOptions();
    const onWheel = (event) => {
        event.preventDefault();
        zoom(event.deltaY > 0 ? 1.12 : 0.89);
    };
    const onPointerDown = (event) => {
        event.preventDefault();
        try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* Pointer capture can be unavailable in embedded browsers. */ }
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 1) pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
        else if (pointerDown) pointerDown.dragged = true;
        if (pointers.size === 2) {
            const positions = [...pointers.values()];
            previousPinchDistance = Math.hypot(positions[0].x - positions[1].x, positions[0].y - positions[1].y);
        }
    };
    const onPointerMove = (event) => {
        const previous = pointers.get(event.pointerId);
        if (!previous) return;
        const current = { x: event.clientX, y: event.clientY };
        if (pointers.size > 1) {
            pointers.set(event.pointerId, current);
            const positions = [...pointers.values()];
            const pinchDistance = Math.hypot(positions[0].x - positions[1].x, positions[0].y - positions[1].y);
            if (previousPinchDistance > 0 && pinchDistance > 0) zoom(previousPinchDistance / pinchDistance);
            previousPinchDistance = pinchDistance;
            if (pointerDown) pointerDown.dragged = true;
            return;
        }
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        pointers.set(event.pointerId, current);
        if (pointerDown && Math.hypot(current.x - pointerDown.x, current.y - pointerDown.y) > 4) pointerDown.dragged = true;
        yaw -= dx * 0.008;
        polar = THREE.MathUtils.clamp(polar + dy * 0.008, 0.18, Math.PI - 0.18);
        updateCamera();
    };
    const onPointerUp = (event) => {
        const click = pointerDown && pointerDown.id === event.pointerId && !pointerDown.dragged && pointers.size === 1;
        if (click) {
            const bounds = renderer.domElement.getBoundingClientRect();
            pointerPosition.set(
                ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
                -((event.clientY - bounds.top) / bounds.height) * 2 + 1
            );
            raycaster.setFromCamera(pointerPosition, camera);
            const partMesh = raycaster.intersectObjects(modelGroup.children, false)
                .find((intersection) => intersection.object.userData.part && !intersection.object.userData.surfaceContext)?.object;
            if (partMesh) {
                const part = partMesh.userData.part;
                const concept = conceptMapById.get(part.conceptId);
                if (concept) selectConcept(concept, false);
                else {
                    clearSelection();
                    selectedConceptId = '';
                    select.value = '';
                    partMesh.material = highlightMaterial;
                    selectedMeshes.add(partMesh);
                    if (selectionStatus) selectionStatus.textContent = 'Selected: ' + part.name + '.';
                    updateCamera();
                }
            }
        }
        pointers.delete(event.pointerId);
        if (!pointers.size) {
            pointerDown = null;
            previousPinchDistance = 0;
        } else {
            pointerDown = { id: [...pointers.keys()][0], ...[...pointers.values()][0], dragged: true };
            previousPinchDistance = 0;
        }
    };
    const onPointerCancel = (event) => {
        pointers.delete(event.pointerId);
        pointerDown = null;
        previousPinchDistance = 0;
    };
    const onLostPointerCapture = (event) => onPointerCancel(event);

    root.addEventListener('click', onControlClick);
    search.addEventListener('input', onSearchInput);
    select.addEventListener('change', onSelectChange);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerCancel);
    renderer.domElement.addEventListener('lostpointercapture', onLostPointerCapture);

    const dispose = () => {
        if (disposed) return;
        disposed = true;
        resizeObserver?.disconnect();
        window.removeEventListener('resize', resize);
        root.removeEventListener('click', onControlClick);
        search.removeEventListener('input', onSearchInput);
        select.removeEventListener('change', onSelectChange);
        renderer.domElement.removeEventListener('wheel', onWheel);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
        renderer.domElement.removeEventListener('lostpointercapture', onLostPointerCapture);
        modelGroup.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
        });
        for (const material of materialBySystem.values()) material.dispose();
        materialBySystem.clear();
        surfaceMaterial.dispose();
        highlightMaterial.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        modelGroup.clear();
        meshByPartId.clear();
        selectedMeshes.clear();
    };

    const loadModel = async () => {
        try {
            setStatus(root, 'Preparing the 3D anatomy reference…');
            const manifest = await getManifest();
            if (disposed) return;
            const focusedSystems = new Set(getAnatomyModelSystems(systemId));
            const requiredSystems = new Set([...focusedSystems, INTEGUMENTARY_SYSTEM]);
            const modelParts = manifest.parts.filter((part) => requiredSystems.has(part.system));
            searchableConcepts = getAnatomyModelConcepts(manifest, systemId);
            conceptMapById = new Map(searchableConcepts.map((concept) => [concept.id, concept]));
            updateStructureOptions();
            const chunks = getAnatomyModelChunks(manifest, systemId);
            for (let index = 0; index < chunks.length; index += 1) {
                if (disposed) return;
                const chunkIndex = chunks[index];
                setStatus(root, 'Loading model data (' + (index + 1) + ' of ' + chunks.length + ')…');
                const buffer = await getChunkBuffer(manifest, chunkIndex);
                if (disposed) return;
                for (const part of modelParts) {
                    if (part.chunk !== chunkIndex) continue;
                    const isSurfaceContext = part.system === INTEGUMENTARY_SYSTEM && !focusedSystems.has(INTEGUMENTARY_SYSTEM);
                    let material = isSurfaceContext ? surfaceMaterial : materialBySystem.get(part.system);
                    if (!material) {
                        material = createMaterial(SYSTEM_COLORS[systemId] || 0x8b8d8b);
                        materialBySystem.set(part.system, material);
                    }
                    const mesh = createPartMesh(part, buffer, material);
                    mesh.userData.defaultMaterial = material;
                    mesh.userData.surfaceContext = isSurfaceContext;
                    modelGroup.add(mesh);
                    meshByPartId.set(part.id, mesh);
                }
                renderer.render(scene, camera);
            }
            if (!modelGroup.children.length) throw new Error('No structures are available for this anatomy topic.');
            resetView();
            modelReady = true;
            root.querySelectorAll('[data-viewer-action]').forEach((button) => { button.disabled = false; });
            search.disabled = false;
            updateStructureOptions();
            setStatus(root, 'Loaded ' + modelGroup.children.length + ' model parts. Search ' + searchableConcepts.length + ' anatomy concepts for this system.');
        } catch (loadError) {
            if (!disposed) showError(root, loadError?.message || 'The 3D anatomy model could not be loaded. The text review is still available.');
        }
    };

    select.disabled = true;
    void loadModel();
    return { dispose };
}
