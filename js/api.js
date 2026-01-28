/**
 * API Communication Layer
 *
 * All communication with n8n webhooks goes through this module
 */

const API = {
    /**
     * Make a GET request to n8n webhook
     */
    async get(endpoint, params = {}) {
        const url = CONFIG.getEndpoint(endpoint, params);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API GET error:', error);

            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error(CONFIG.MESSAGES.NETWORK_ERROR);
            }

            throw error;
        }
    },

    /**
     * Make a POST request to n8n webhook
     */
    async post(endpoint, data = {}, params = {}) {
        const url = CONFIG.getEndpoint(endpoint, params);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API POST error:', error);

            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error(CONFIG.MESSAGES.NETWORK_ERROR);
            }

            throw error;
        }
    },

    // ==========================================
    // Installer Endpoints
    // ==========================================

    /**
     * Get all tasks for an installer
     * @param {string} slug - Installer's portal slug
     * @param {string} fromDate - Optional start date (YYYY-MM-DD)
     * @param {string} toDate - Optional end date (YYYY-MM-DD)
     */
    async getInstallerTasks(slug, fromDate = null, toDate = null) {
        let endpoint = CONFIG.ENDPOINTS.INSTALLER_TASKS;

        // Add date filters as query params if needed
        const params = { slug };

        const result = await this.get(endpoint, params);

        if (result.error) {
            throw new Error(result.error.message || CONFIG.MESSAGES.UNKNOWN_ERROR);
        }

        return result;
    },

    /**
     * Get details for a single task
     * @param {number} taskId - Task ID
     */
    async getTaskDetails(taskId) {
        const result = await this.get(CONFIG.ENDPOINTS.TASK_DETAILS, { id: taskId });

        if (result.error) {
            throw new Error(result.error.message || CONFIG.MESSAGES.TASK_NOT_FOUND);
        }

        return result.task || result;
    },

    /**
     * Get PDF attachments for a task
     * @param {number} taskId - Task ID
     */
    async getTaskPDFs(taskId) {
        const result = await this.get(CONFIG.ENDPOINTS.TASK_PDFS, { id: taskId });

        if (result.error) {
            throw new Error(result.error.message || CONFIG.MESSAGES.UNKNOWN_ERROR);
        }

        return result.pdfs || [];
    },

    /**
     * Get photo attachments for a task
     * @param {number} taskId - Task ID
     */
    async getTaskPhotos(taskId) {
        const result = await this.get(CONFIG.ENDPOINTS.TASK_PHOTOS, { id: taskId });

        if (result.error) {
            throw new Error(result.error.message || CONFIG.MESSAGES.UNKNOWN_ERROR);
        }

        return result.photos || [];
    },

    /**
     * Upload a photo for a collector
     * @param {object} data - Photo upload data
     */
    async uploadPhoto(data) {
        const result = await this.post(CONFIG.ENDPOINTS.UPLOAD_PHOTO, {
            task_id: data.taskId,
            collector_number: data.collectorNumber,
            photo_type: data.photoType, // 'manometer' or 'pipe'
            installer_id: data.installerId,
            installer_name: data.installerName,
            base64_data: data.base64Data,
            mimetype: data.mimetype,
            filename: data.filename
        });

        if (result.error) {
            throw new Error(result.error.message || CONFIG.MESSAGES.UPLOAD_ERROR);
        }

        return result;
    },

    /**
     * Update collector status
     * @param {object} data - Collector status data
     */
    async updateCollectorStatus(data) {
        const result = await this.post(CONFIG.ENDPOINTS.UPDATE_COLLECTOR, {
            task_id: data.taskId,
            collector_number: data.collectorNumber,
            responsible_id: data.responsibleId,
            responsible_name: data.responsibleName,
            manometer_photo_id: data.manometerPhotoId,
            pipe_photo_ids: data.pipePhotoIds,
            notes: data.notes,
            completed: data.completed
        });

        if (result.error) {
            throw new Error(result.error.message || CONFIG.MESSAGES.UNKNOWN_ERROR);
        }

        return result;
    },

    /**
     * Submit an issue/problem report
     * @param {number} taskId - Task ID
     * @param {string} issue - Issue description
     */
    async submitIssue(taskId, issue) {
        const result = await this.post(CONFIG.ENDPOINTS.SUBMIT_ISSUE, {
            task_id: taskId,
            issue: issue,
            timestamp: new Date().toISOString()
        }, { id: taskId });

        if (result.error) {
            throw new Error(result.error.message || CONFIG.MESSAGES.UNKNOWN_ERROR);
        }

        return result;
    },

    // ==========================================
    // Subcontractor Endpoints
    // ==========================================

    /**
     * Get all tasks for a subcontractor company
     * @param {number|string} contractorId - Contractor ID or slug
     * @param {string} fromDate - Start date
     * @param {string} toDate - End date
     */
    async getContractorTasks(contractorId, fromDate = null, toDate = null) {
        const result = await this.get(CONFIG.ENDPOINTS.CONTRACTOR_TASKS, { id: contractorId });

        if (result.error) {
            throw new Error(result.error.message || CONFIG.MESSAGES.UNKNOWN_ERROR);
        }

        return result;
    },

    /**
     * Get available workers for a contractor
     * @param {number|string} contractorId - Contractor ID
     */
    async getContractorWorkers(contractorId) {
        const result = await this.get(CONFIG.ENDPOINTS.CONTRACTOR_WORKERS, { id: contractorId });

        if (result.error) {
            throw new Error(result.error.message || CONFIG.MESSAGES.UNKNOWN_ERROR);
        }

        return result.workers || [];
    },

    /**
     * Assign a worker to a task
     * @param {number} taskId - Task ID
     * @param {number} workerId - Worker partner ID
     * @param {number} contractorId - Contractor company ID
     */
    async assignWorker(taskId, workerId, contractorId) {
        const result = await this.post(CONFIG.ENDPOINTS.ASSIGN_WORKER, {
            task_id: taskId,
            worker_id: workerId,
            contractor_id: contractorId
        });

        if (result.error) {
            throw new Error(result.error.message || CONFIG.MESSAGES.UNKNOWN_ERROR);
        }

        return result;
    }
};
