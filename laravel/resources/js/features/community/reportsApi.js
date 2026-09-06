import api from '../../api';

export const checkReportEligibility = (locationId) =>
    api.get(`/reports/check/${locationId}`);

export const submitReport = (locationId, formData) =>
    api.post(`/reports/${locationId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });

export const getReportForLocation = (locationId) =>
    api.get(`/reports/location/${locationId}`);

export const checkVerifyEligibility = (reportId) =>
    api.get(`/reports/${reportId}/check`);

export const verifyReport = (reportId, { verdict }) =>
    api.post(`/reports/${reportId}/verify`, { verdict });
