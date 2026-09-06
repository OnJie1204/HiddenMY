import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { checkReportEligibility, submitReport } from '@/features/community/reportsApi';
import { loginNavOptions } from '@/utils/auth/authRedirect';
import { checkIn as postCheckIn } from '@/features/community/votesApi';

// A verified place (pending_community_vote / hidden_gem / well_known) can be
// reported for two things, both resolved by a community vote (one report per
// reason open at a time). Both reasons need a check-in at the place — you have
// to have actually been there.
//   permanently_closed     — the place has shut for good.
//   incorrect_contact_info — the hours / phone / website are wrong.
const REASONS = [
    { value: 'permanently_closed', label: 'Permanently closed' },
    { value: 'incorrect_contact_info', label: 'Contact info is wrong (hours / phone / website)' },
];

// checking -> reason -> [checkin] -> form -> success/error.
function ReportModal({ locationId, isOpen, onClose, onReportSuccess }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [step, setStep] = useState('checking');
    const [loading, setLoading] = useState(false);
    const [eligibility, setEligibility] = useState(null);
    const [reason, setReason] = useState('');
    const [description, setDescription] = useState('');
    const [photo, setPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('error');
    const [checkingIn, setCheckingIn] = useState(false);
    const [gpsStatus, setGpsStatus] = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (isOpen && locationId) {
            checkEligibility();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, locationId]);

    const checkEligibility = async () => {
        setLoading(true);
        setStep('checking');
        try {
            const res = await checkReportEligibility(locationId);
            const data = res.data;
            setEligibility(data);
            setStep(data.eligible ? 'reason' : 'error');
            if (!data.eligible) {
                setMessage(data.message);
                setMessageType('error');
            }
        } catch (error) {
            setStep('error');
            setMessage(error?.response?.data?.message || 'Unable to check eligibility');
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    };

    const gemLocation = eligibility?.location;

    const handleReasonContinue = () => {
        if (!reason) {
            setMessage('Please choose a reason.');
            setMessageType('error');
            return;
        }
        setMessage('');
        setStep(eligibility?.has_check_in ? 'form' : 'checkin');
    };

    const useCurrentLocation = () => {
        setGpsStatus('Getting your location…');
        setMessage('');
        if (!navigator.geolocation) {
            setGpsStatus('error: Your browser can\'t share your location, so this place can\'t be reported from here.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setGpsStatus('success: Location found — checking you in…');
                performCheckIn(position.coords.latitude, position.coords.longitude);
            },
            (error) => {
                setGpsStatus('error: ' + (error.code === 1
                    ? 'Location permission denied. Allow location access to report this place.'
                    : ('Couldn\'t get your location. ' + (error.message || ''))));
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    };

    const performCheckIn = async (latitude, longitude) => {
        setCheckingIn(true);
        setMessage('');
        try {
            const res = await postCheckIn(locationId, { latitude, longitude });
            setEligibility((prev) => ({ ...prev, has_check_in: true }));
            const distanceMsg = res.data.distance ? ` (${res.data.distance} km away)` : '';
            setMessage('Check-in successful!' + distanceMsg);
            setMessageType('success');
            setStep('form');
        } catch (error) {
            const data = error?.response?.data;
            if (data?.distance && data?.max_distance) {
                setMessage(`You are ${data.distance} km away. You must be within ${data.max_distance} km of the place to report it.`);
            } else {
                setMessage(data?.message || 'Check-in failed');
            }
            setMessageType('error');
            setGpsStatus('');
        } finally {
            setCheckingIn(false);
        }
    };

    const handlePhotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPhoto(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async () => {
        setLoading(true);
        setMessage('');
        try {
            const formData = new FormData();
            formData.append('reason', reason);
            if (description) formData.append('description', description);
            if (photo) formData.append('photo', photo);

            const res = await submitReport(locationId, formData);
            setStep('success');
            setMessage(res.data.message);
            onReportSuccess?.(res.data);
        } catch (error) {
            setMessage(error?.response?.data?.message || 'Failed to submit report');
            setMessageType('error');
            setStep('error');
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setStep('checking');
        setReason('');
        setDescription('');
        setPhoto(null);
        setPhotoPreview(null);
        setMessage('');
        setEligibility(null);
        setGpsStatus('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const goToLogin = () => {
        handleClose();
        navigate('/login', loginNavOptions(location));
    };

    if (!isOpen) return null;

    const availableReasons = eligibility?.reasons
        ? REASONS.filter((r) => eligibility.reasons.includes(r.value))
        : REASONS;
    const selectedReasonMeta = REASONS.find((r) => r.value === reason);

    return createPortal((
        <div className="vote-modal-overlay" onClick={(e) => { e.stopPropagation(); handleClose(); }}>
            <div className="vote-modal" onClick={(e) => e.stopPropagation()}>
                <div className="vote-modal-header">
                    <h2>Report Hidden Gem</h2>
                    <button className="vote-modal-close" onClick={handleClose}>✕</button>
                </div>

                <div className="vote-modal-body">
                    {step === 'checking' && (
                        <div className="vote-loading">
                            <div className="vote-loading-spinner"></div>
                            <p>Checking eligibility...</p>
                        </div>
                    )}

                    {step === 'reason' && (
                        <div className="vote-form">
                            <div className="vote-location-info">
                                <p>{gemLocation?.place_name}</p>
                                <p className="vote-location-address">{gemLocation?.address}</p>
                            </div>

                            <div className="vote-form-group">
                                <label>What's the issue?</label>
                                <select
                                    className="report-reason-select"
                                    value={reason}
                                    onChange={(e) => { setReason(e.target.value); setMessage(''); }}
                                >
                                    <option value="" disabled>Choose a reason…</option>
                                    {availableReasons.map((r) => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                                {selectedReasonMeta && (
                                    <p className="report-reason-hint">
                                        You'll need to check in at this location — you have to have
                                        actually been there to report this. The community then votes;
                                        5 either way settles it.
                                    </p>
                                )}
                            </div>

                            {message && <div className={`vote-message ${messageType}`}>{message}</div>}

                            <div className="vote-actions">
                                <button className="vote-btn-primary" onClick={handleReasonContinue} disabled={!reason}>
                                    Continue
                                </button>
                                <button className="vote-btn-secondary" onClick={handleClose}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {step === 'checkin' && (
                        <div className="vote-checkin">
                            <h3>Check-in Required</h3>
                            <p>Reporting a place needs you to have actually been there. We'll use your
                               current location to check you in — you must be within 5 km.</p>

                            {gemLocation && (
                                <div className="vote-checkin-location">
                                    <p className="vote-checkin-location-name">{gemLocation.place_name}</p>
                                    <p className="vote-checkin-location-address">{gemLocation.address}</p>
                                </div>
                            )}

                            <div className="vote-checkin-options">
                                <button className="vote-checkin-option" onClick={useCurrentLocation} disabled={checkingIn}>
                                    <span className="vote-checkin-option-label">
                                        {checkingIn ? 'Checking in…' : 'Use My Current Location'}
                                    </span>
                                    <span className="vote-checkin-option-desc">Share your location to check in here</span>
                                </button>
                            </div>

                            {gpsStatus && (
                                <div className={`vote-gps-status ${gpsStatus.startsWith('error:') ? 'error' : 'success'}`}>
                                    {gpsStatus.replace(/^(error:|success:)/, '')}
                                </div>
                            )}
                            {message && <div className={`vote-message ${messageType}`}>{message}</div>}

                            <button className="vote-manual-back" onClick={() => setStep('reason')}>← Back</button>
                            <button className="vote-btn-secondary" onClick={handleClose}>Cancel</button>
                        </div>
                    )}

                    {step === 'form' && (
                        <div className="vote-form">
                            <div className="vote-location-info">
                                <p>{gemLocation?.place_name}</p>
                                <p className="vote-location-address">{gemLocation?.address}</p>
                            </div>

                            <div className="report-summary">
                                <span className="report-summary-label">Reason</span>
                                <strong>{selectedReasonMeta?.label}</strong>
                            </div>

                            <div className="vote-form-group">
                                <label>
                                    {reason === 'incorrect_contact_info'
                                        ? 'What is wrong, and what should it be?'
                                        : 'Details (optional)'}
                                </label>
                                <textarea
                                    className="vote-textarea"
                                    placeholder={reason === 'incorrect_contact_info'
                                        ? 'e.g. The phone number is disconnected; the correct one is 012-345 6789.'
                                        : 'Add any context that would help others verify this...'}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    maxLength={1000}
                                />
                                <span className="vote-char-count">{description.length}/1000</span>
                            </div>

                            <div className="vote-form-group">
                                <label>Evidence photo (optional)</label>
                                <div className="vote-upload-area" onClick={() => fileInputRef.current?.click()}>
                                    {photoPreview ? (
                                        <img src={photoPreview} alt="Preview" className="vote-photo-preview" />
                                    ) : (
                                        <div className="vote-upload-placeholder"><p>Click to upload a photo</p></div>
                                    )}
                                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
                                </div>
                                {photo && (
                                    <button className="vote-remove-photo" onClick={() => {
                                        setPhoto(null); setPhotoPreview(null);
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}>
                                        Remove photo
                                    </button>
                                )}
                            </div>

                            {message && <div className={`vote-message ${messageType}`}>{message}</div>}

                            <button className="vote-manual-back" onClick={() => setStep('reason')}>← Change reason</button>

                            <div className="vote-actions">
                                <button className="vote-btn-primary report-btn-primary" onClick={handleSubmit} disabled={loading}>
                                    {loading ? 'Submitting...' : 'Submit Report'}
                                </button>
                                <button className="vote-btn-secondary" onClick={handleClose}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="vote-success">
                            <h3>Report Submitted</h3>
                            <p>{message}</p>
                            <button className="vote-btn-primary" onClick={handleClose}>Close</button>
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="vote-error">
                            <h3>Cannot Report</h3>
                            <p>{message}</p>
                            {message.includes('login') ? (
                                <button className="vote-btn-primary" onClick={goToLogin}>Login to Report</button>
                            ) : (
                                <button className="vote-btn-primary" onClick={handleClose}>Close</button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    ), document.body);
}

export default ReportModal;
