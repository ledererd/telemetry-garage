/**
 * Distance Calculator
 * Calculates cumulative distance from GPS coordinates using Haversine formula
 */

class DistanceCalculator {
    /**
     * Calculate distance between two GPS points using Haversine formula
     * @param {number} lat1 - Latitude of first point
     * @param {number} lon1 - Longitude of first point
     * @param {number} lat2 - Latitude of second point
     * @param {number} lon2 - Longitude of second point
     * @returns {number} Distance in meters
     */
    static haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Earth's radius in meters
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Convert degrees to radians
     */
    static toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Calculate cumulative distance for an array of telemetry records
     * @param {Array} records - Array of telemetry records with location data
     * @returns {Array} Array of records with added distance property
     */
    static calculateCumulativeDistance(records) {
        if (!records || records.length === 0) {
            return [];
        }

        const result = [...records];
        let cumulativeDistance = 0;

        // First record starts at distance 0
        result[0].distance = 0;

        for (let i = 1; i < result.length; i++) {
            const prev = result[i - 1];
            const curr = result[i];

            if (prev.location && curr.location &&
                prev.location.latitude && prev.location.longitude &&
                curr.location.latitude && curr.location.longitude) {
                
                const segmentDistance = this.haversineDistance(
                    prev.location.latitude,
                    prev.location.longitude,
                    curr.location.latitude,
                    curr.location.longitude
                );

                cumulativeDistance += segmentDistance;
            }

            result[i].distance = cumulativeDistance;
        }

        return result;
    }

    /**
     * Convert distance from meters to kilometers
     */
    static metersToKilometers(meters) {
        return meters / 1000;
    }
}

