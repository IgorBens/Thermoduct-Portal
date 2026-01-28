/**
 * Authentication Helper
 *
 * For now, uses simple URL-based identification.
 * Can be extended for PIN-based auth in the future.
 */

const Auth = {
    /**
     * Get current installer slug from storage or URL
     */
    getInstallerSlug() {
        // Check URL first
        const match = window.location.pathname.match(/\/installer\/([a-z0-9-]+)/);
        if (match) {
            return match[1];
        }

        // Fall back to storage
        return localStorage.getItem(CONFIG.SETTINGS.STORAGE_KEYS.INSTALLER_SLUG);
    },

    /**
     * Set installer slug
     */
    setInstallerSlug(slug) {
        localStorage.setItem(CONFIG.SETTINGS.STORAGE_KEYS.INSTALLER_SLUG, slug);
    },

    /**
     * Clear stored authentication
     */
    logout() {
        localStorage.removeItem(CONFIG.SETTINGS.STORAGE_KEYS.INSTALLER_SLUG);
        localStorage.removeItem(CONFIG.SETTINGS.STORAGE_KEYS.LAST_VIEWED_TASKS);
        window.location.href = '/';
    },

    /**
     * Check if user is "logged in" (has slug)
     */
    isAuthenticated() {
        return !!this.getInstallerSlug();
    },

    /**
     * Get contractor ID from URL (for subcontractor portal)
     */
    getContractorId() {
        const match = window.location.pathname.match(/\/contractor\/([a-z0-9-]+)/);
        return match ? match[1] : null;
    }
};
