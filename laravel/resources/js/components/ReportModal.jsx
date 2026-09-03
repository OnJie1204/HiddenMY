import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { checkReportEligibility, submitReport } from '../api/reports';
import { checkIn as postCheckIn } from '../api/votes';

// A verified place (pending_community_vote / hidden_gem / well_known) can be
// reported for two things (see Report::REASONS). Both are resolved by a
// community vote; one report per reason may be open at a time.
//   permanently_closed     — the place has shut for good. Needs a check-in.
//   incorrect_contact_info — the hours / phone / website are wrong. No check-in,
//                            but the reporter must be an established account
//                            (backend-enforced).
const REASONS = [
    { value: 'permanently_closed', label: 'Permanently closed', requiresCheckIn: true },
    { value: 'incorrect_contact_info', label: 'Contact info is wrong (hours / phone / website)', requiresCheckIn: false },
];

// checking -> reason -> [checkin -> manual_checkin] -> form -> success/error.
function ReportModal({ locationId, isOpen, onClose, onReportSuccess }) {
    const navigate = useNavigate();
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
    const [manualLat, setManualLat] = useState('');
    const [manualLng, setManualLng] = useState('');
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
    const minAccountAgeDays = eligibility?.min_account_age_days ?? 7;

    const handleReasonContinue = () => {
        if (!reason) {
            setMessage('Please choose a reason.');
            setMessageType('error');
            return;
        }
        setMessage('');
        const meta = REASONS.find((r) => r.value === reason);
        if (meta?.requiresCheckIn && !eligibility?.has_check_in) {
            setStep('checkin');
        } else {
            setStep('form');
        }
    };

    const getCurrentLocation = () => {
        setGpsStatus('Getting your location...');
        if (!navigator.geolocation) {
            setGpsStatus('error: Geolocation is not supported by your browser');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setGpsStatus('success: Location found!');
                performCheckIn(latitude, longitude);
            },
            (error) => {
                setGpsStatus('error: Unable to get your location. ' + (error.message || ''));
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
                setMessage(`You are ${data.distance} km away. You must be within ${data.max_distance} km to check in.`);
            } else {
                setMessage(data?.message || 'Check-in failed');
            }
            setMessageType('error');
        } finally {
            setCheckingIn(false);
        }
    };

    const confirmManualCheckIn = () => {
        const lat = parseFloat(manualLat);
        const lng = parseFloat(manualLng);
        if (!manualLat || !manualLng || isNaN(lat) || isNaN(lng)) {
            setMessage('Please enter valid coordinates.');
            setMessageType('error');
            return;
        }
        performCheckIn(lat, lng);
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
        setManualLat('');
        setManualLng('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const goToLogin = () => {
        handleClose();
        navigate('/login');
    };

    if (!isOpen) return null;

    // The backend returns which reasons are still open for this place.
    const availableReasons = eligibility?.reasons
        ? REASONS.filter((r) => eligibility.reasons.includes(r.value))
        : REASONS;
    const selectedReasonMeta = REASONS.find((r) => r.value === reason);
    const contactReasonBlocked = reason === 'incorrect_contact_info'
        && eligibility && eligibility.is_established_account === false;

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
                                        {selectedReasonMeta.requiresCheckIn
                                            ? "You'll need to check in at this location — you have to have actually been there to know this."
                                            : "The community votes on your report. If it's confirmed, a warning shows next to the contact info until the owner corrects it."}
                                    </p>
                                )}
                                {contactReasonBlocked && (
                                    <p className="vote-message error" style={{ marginTop: 8 }}>
                                        Reporting incorrect contact info needs an account at least {minAccountAgeDays} days
                                        old, or one that has checked in somewhere before.
                                    </p>
                                )}
                            </div>

                            {message && <div className={`vote-message ${messageType}`}>{message}</div>}

                            <div className="vote-actions">
                                <button
                                    className="vote-btn-primary"
                                    onClick={handleReasonContinue}
                                    disabled={!reason || contactReasonBlocked}
                                >
                                    Continue
                                </button>
                                <button className="vote-btn-secondary" onClick={handleClose}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {step === 'checkin' && (
                        <div className="vote-checkin">
                            <h3>Check-in Required</h3>
                            <p>This reason needs you to have actually been at the location — check in before you can report it.</p>

                            {gemLocation && (
                                <div className="vote-checkin-location">
                                    <p className="vote-checkin-location-name">{gemLocation.place_name}</p>
                                    <p className="vote-checkin-location-address">{gemLocation.address}</p>
                                </div>
                            )}

                            <p className="vote-checkin-hint">You must be within 5 km to check in.</p>

                            <div className="vote-checkin-options">
                                <button className="vote-checkin-option" onClick={getCurrentLocation} disabled={checkingIn}>
                                    <span className="vote-checkin-option-label">Use My Current Location</span>
                                    <span className="vote-checkin-option-desc">Auto-detect your GPS position</span>
                                </button>
                                <button className="vote-checkin-option" onClick={() => setStep('manual_checkin')} disabled={checkingIn}>
                                    <span className="vote-checkin-option-label">Enter Current Location</span>
                                    <span className="vote-checkin-option-desc">Manually enter your GPS coordinates</span>
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

                    {step === 'manual_checkin' && (
                        <div className="vote-manual-checkin">
                            <button className="vote-manual-back" onClick={() => setStep('checkin')}>← Back</button>
                            <h3>Enter Your Current Location</h3>

                            <div className="vote-manual-inputs">
                                <div className="vote-manual-input-group">
                                    <label>Latitude</label>
                                    <input type="text" className="vote-manual-input" placeholder="e.g. 3.2143"
                                        value={manualLat} onChange={(e) => setManualLat(e.target.value)} />
                                </div>
                                <div className="vote-manual-input-group">
                                    <label>Longitude</label>
                                    <input type="text" className="vote-manual-input" placeholder="e.g. 101.7281"
                                        value={manualLng} onChange={(e) => setManualLng(e.target.value)} />
                                </div>
                            </div>

                            {message && <div className={`vote-message ${messageType}`}>{message}</div>}

                            <div className="vote-actions">
                                <button className="vote-btn-primary" onClick={confirmManualCheckIn} disabled={checkingIn}>
                                    {checkingIn ? 'Checking in...' : 'Confirm Check-in'}
                                </button>
                                <button className="vote-btn-secondary" onClick={() => setStep('checkin')}>Cancel</button>
                            </div>
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
