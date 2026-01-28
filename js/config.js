/**
 * Thermoduct Portal Configuration
 *
 * Update these values to match your n8n webhook URLs
 */

const CONFIG = {
    // n8n webhook base URL - UPDATE THIS
    N8N_BASE_URL: 'https://your-n8n-instance.com/webhook/thermoduct',

    // API Endpoints
    ENDPOINTS: {
        // Installer endpoints
        INSTALLER_TASKS: '/installer/{slug}/tasks',
        TASK_DETAILS: '/task/{id}',
        TASK_PDFS: '/task/{id}/pdfs',
        TASK_PHOTOS: '/task/{id}/photos',
        UPLOAD_PHOTO: '/upload-photo',
        UPDATE_COLLECTOR: '/update-collector',
        SUBMIT_ISSUE: '/task/{id}/issue',

        // Subcontractor endpoints
        CONTRACTOR_TASKS: '/contractor/{id}/tasks',
        CONTRACTOR_WORKERS: '/contractor/{id}/workers',
        ASSIGN_WORKER: '/assign-worker'
    },

    // Build full URL for endpoint
    getEndpoint(endpoint, params = {}) {
        let url = this.N8N_BASE_URL + endpoint;

        // Replace URL parameters
        Object.keys(params).forEach(key => {
            url = url.replace(`{${key}}`, params[key]);
        });

        return url;
    },

    // Portal settings
    SETTINGS: {
        // How many days ahead to show tasks
        DAYS_AHEAD: 7,

        // Max file size for photo uploads (in bytes)
        MAX_PHOTO_SIZE: 10 * 1024 * 1024, // 10MB

        // Image compression quality (0-1)
        IMAGE_QUALITY: 0.8,

        // Max image width after compression
        MAX_IMAGE_WIDTH: 1920,

        // Supported file types for upload
        ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],

        // Auto-refresh interval (in milliseconds, 0 = disabled)
        AUTO_REFRESH_INTERVAL: 0,

        // Local storage keys
        STORAGE_KEYS: {
            INSTALLER_SLUG: 'thermoduct_installer_slug',
            LAST_VIEWED_TASKS: 'thermoduct_last_viewed',
            PENDING_UPLOADS: 'thermoduct_pending_uploads'
        }
    },

    // Date formatting (Dutch)
    DATE_LOCALE: 'nl-NL',
    DATE_OPTIONS: {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    },

    // Error messages (Dutch)
    MESSAGES: {
        LOADING: 'Laden...',
        NO_TASKS: 'Geen taken voor vandaag',
        UPLOAD_SUCCESS: 'Foto succesvol geupload',
        UPLOAD_ERROR: 'Fout bij uploaden foto',
        NETWORK_ERROR: 'Geen internetverbinding',
        UNKNOWN_ERROR: 'Er ging iets mis',
        INSTALLER_NOT_FOUND: 'Installateur niet gevonden',
        TASK_NOT_FOUND: 'Taak niet gevonden'
    }
};

// Freeze config to prevent accidental modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.ENDPOINTS);
Object.freeze(CONFIG.SETTINGS);
Object.freeze(CONFIG.MESSAGES);
