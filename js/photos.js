/**
 * Photo Upload Handler
 *
 * Handles photo capture, compression, and upload to Odoo via n8n
 */

const PhotoHandler = {
    /**
     * Handle single photo upload (manometer)
     */
    async upload(input, taskId, collectorNumber, photoType) {
        if (!input.files || input.files.length === 0) return;

        const file = input.files[0];

        // Validate file type
        if (!CONFIG.SETTINGS.ALLOWED_FILE_TYPES.includes(file.type)) {
            alert('Ongeldig bestandstype. Gebruik JPG, PNG of WebP.');
            input.value = '';
            return;
        }

        // Validate file size
        if (file.size > CONFIG.SETTINGS.MAX_PHOTO_SIZE) {
            alert(`Bestand te groot. Maximum is ${CONFIG.SETTINGS.MAX_PHOTO_SIZE / 1024 / 1024}MB.`);
            input.value = '';
            return;
        }

        // Show loading state
        const container = input.parentElement;
        const originalContent = container.innerHTML;
        container.innerHTML = '<span class="uploading">Uploaden...</span>';

        try {
            // Compress and convert to base64
            const base64Data = await this.compressAndConvert(file);

            // Get installer info
            const slug = localStorage.getItem(CONFIG.SETTINGS.STORAGE_KEYS.INSTALLER_SLUG);

            // Generate filename
            const filename = this.generateFilename(taskId, collectorNumber, photoType, slug);

            // Upload via API
            const result = await API.uploadPhoto({
                taskId: taskId,
                collectorNumber: collectorNumber,
                photoType: photoType,
                installerId: null, // Will be set by n8n based on slug
                installerName: slug,
                base64Data: base64Data,
                mimetype: 'image/jpeg',
                filename: filename
            });

            // Show success
            container.innerHTML = '<span class="upload-done">Geupload</span>';

            // Store attachment ID for later
            container.dataset.attachmentId = result.attachment_id;

        } catch (error) {
            console.error('Upload failed:', error);
            container.innerHTML = originalContent;
            alert(CONFIG.MESSAGES.UPLOAD_ERROR + ': ' + error.message);
        }
    },

    /**
     * Handle multiple photo upload (pipes)
     */
    async uploadMultiple(input, taskId, collectorNumber, photoType) {
        if (!input.files || input.files.length === 0) return;

        const files = Array.from(input.files);
        const container = input.parentElement;

        // Validate all files
        for (const file of files) {
            if (!CONFIG.SETTINGS.ALLOWED_FILE_TYPES.includes(file.type)) {
                alert('Een of meer bestanden hebben een ongeldig type.');
                input.value = '';
                return;
            }

            if (file.size > CONFIG.SETTINGS.MAX_PHOTO_SIZE) {
                alert(`Een of meer bestanden zijn te groot. Maximum is ${CONFIG.SETTINGS.MAX_PHOTO_SIZE / 1024 / 1024}MB.`);
                input.value = '';
                return;
            }
        }

        // Show loading
        const statusEl = document.createElement('span');
        statusEl.className = 'uploading';
        statusEl.textContent = `Uploaden 0/${files.length}...`;
        container.insertBefore(statusEl, input);

        const slug = localStorage.getItem(CONFIG.SETTINGS.STORAGE_KEYS.INSTALLER_SLUG);
        const uploadedIds = [];

        try {
            for (let i = 0; i < files.length; i++) {
                statusEl.textContent = `Uploaden ${i + 1}/${files.length}...`;

                const base64Data = await this.compressAndConvert(files[i]);
                const filename = this.generateFilename(taskId, collectorNumber, `${photoType}-${i + 1}`, slug);

                const result = await API.uploadPhoto({
                    taskId: taskId,
                    collectorNumber: collectorNumber,
                    photoType: photoType,
                    installerId: null,
                    installerName: slug,
                    base64Data: base64Data,
                    mimetype: 'image/jpeg',
                    filename: filename
                });

                uploadedIds.push(result.attachment_id);
            }

            // Show success
            statusEl.className = 'upload-done';
            statusEl.textContent = `${files.length} foto's geupload`;

            // Store IDs
            container.dataset.attachmentIds = JSON.stringify(uploadedIds);

        } catch (error) {
            console.error('Upload failed:', error);
            statusEl.className = 'upload-error';
            statusEl.textContent = 'Upload mislukt';
            alert(CONFIG.MESSAGES.UPLOAD_ERROR + ': ' + error.message);
        }
    },

    /**
     * Compress image and convert to base64
     */
    async compressAndConvert(file) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                // Calculate new dimensions
                let width = img.width;
                let height = img.height;

                if (width > CONFIG.SETTINGS.MAX_IMAGE_WIDTH) {
                    height = (height * CONFIG.SETTINGS.MAX_IMAGE_WIDTH) / width;
                    width = CONFIG.SETTINGS.MAX_IMAGE_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;

                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height);

                // Get base64 (without data URL prefix)
                const dataUrl = canvas.toDataURL('image/jpeg', CONFIG.SETTINGS.IMAGE_QUALITY);
                const base64 = dataUrl.split(',')[1];

                resolve(base64);
            };

            img.onerror = () => reject(new Error('Kon afbeelding niet laden'));
            img.src = URL.createObjectURL(file);
        });
    },

    /**
     * Generate standardized filename
     */
    generateFilename(taskId, collectorNumber, photoType, installerSlug) {
        const timestamp = Date.now();
        const slug = (installerSlug || 'unknown').replace(/[^a-z0-9-]/g, '');
        return `${taskId}-C${collectorNumber}-${photoType}-${slug}-${timestamp}.jpg`;
    }
};

/**
 * Collector Form Handler
 */
const CollectorHandler = {
    /**
     * Mark collector as complete
     */
    async complete(taskId, collectorNumber) {
        // Get form data
        const responsibleSelect = document.getElementById(`responsible-${collectorNumber}`);
        const notesField = document.getElementById(`notes-${collectorNumber}`);
        const manometerUpload = document.getElementById(`manometer-upload-${collectorNumber}`);
        const pipeUpload = document.getElementById(`pipe-upload-${collectorNumber}`);

        // Validate
        if (!responsibleSelect.value) {
            alert('Selecteer een verantwoordelijke');
            return;
        }

        if (!manometerUpload.dataset.attachmentId && !manometerUpload.querySelector('.upload-done')) {
            alert('Upload eerst de manometer foto');
            return;
        }

        // Collect data
        const data = {
            taskId: taskId,
            collectorNumber: collectorNumber,
            responsibleId: parseInt(responsibleSelect.value),
            responsibleName: responsibleSelect.options[responsibleSelect.selectedIndex].text,
            manometerPhotoId: manometerUpload.dataset.attachmentId || null,
            pipePhotoIds: pipeUpload.dataset.attachmentIds
                ? JSON.parse(pipeUpload.dataset.attachmentIds)
                : [],
            notes: notesField.value,
            completed: true
        };

        try {
            await API.updateCollectorStatus(data);

            // Update UI
            const form = document.querySelector(`.collector-form[data-collector="${collectorNumber}"]`);
            form.classList.add('completed');
            form.querySelector('.complete-btn')?.remove();

            // Add completed badge
            const header = form.querySelector('.collector-header');
            if (!header.querySelector('.status-badge')) {
                header.innerHTML += '<span class="status-badge">Afgerond</span>';
            }

            // Disable inputs
            form.querySelectorAll('select, textarea').forEach(el => el.disabled = true);

            alert('Collector afgerond!');

        } catch (error) {
            console.error('Failed to complete collector:', error);
            alert('Fout bij afronden: ' + error.message);
        }
    }
};

/**
 * Task PDF Handler
 */
const TaskHandler = {
    /**
     * Load and display PDFs for a task
     */
    async loadPDFs(taskId) {
        const container = document.getElementById('pdf-list');
        container.innerHTML = '<span class="loading-inline">PDF\'s laden...</span>';

        try {
            const pdfs = await API.getTaskPDFs(taskId);

            if (pdfs.length === 0) {
                container.innerHTML = '<p>Geen PDF\'s beschikbaar</p>';
                return;
            }

            container.innerHTML = pdfs.map(pdf => `
                <a href="data:application/pdf;base64,${pdf.data}"
                   download="${pdf.name}"
                   class="pdf-download">
                    ${pdf.name} (${(pdf.size_mb || pdf.file_size / 1024 / 1024).toFixed(1)}MB)
                </a>
            `).join('');

        } catch (error) {
            console.error('Failed to load PDFs:', error);
            container.innerHTML = `
                <p class="error">Kon PDF's niet laden</p>
                <button onclick="TaskHandler.loadPDFs(${taskId})">Opnieuw proberen</button>
            `;
        }
    }
};
