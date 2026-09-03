import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { checkReportEligibility, submitReport } from '../api/reports';

// A Hidden Gem — verified, or still in community voting — can be reported for
// two things (see Report::REASONS). The backend returns which reasons apply to
// this gem's status; `inappropriate_content` also covers more on a gem still
// in voting (location + description, not just contact info).
const REASONS = [
    { value: 'permanently_closed', label: 'Permanently closed', requiresLocation: true },
    { value: 'inappropriate_content', label: 'Information is wrong', requiresLocation: false },
];

// checking -> reason -> [location] -> [corrections] -> form -> success/error.
function ReportModal({ locationId, isOpen, onClose, onReportSuccess }) {
    const navigate = useNavigate();
    const [step, setStep] = useState('checking');
    const [loading, setLoading] = useState(false);
    const [eligibility, setEligibility] = useState(null);
    const [reason, setReason] = useState('');
    const [suggestedHours, setSuggestedHours] = useState('');
    const [suggestedPhone, setSuggestedPhone] = useState('');
    const [suggestedWebsite, setSuggestedWebsite] = useState('');
    const [suggestedDescription, setSuggestedDescription] = useState('');
    const [wantLocationFix, setWantLocationFix] = useState(false);
    // Captured from the user's current GPS position.
    const [suggestedCoords, setSuggestedCoords] = useState(null);
    const [description, setDescription] = useState('');
    const [photo, setPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('error');
    const [checkingLocation, setCheckingLocation] = useState(false);
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
    const isVotingGem = gemLocation?.status === 'pending_community_vote';

    const prefillFromGem = () => {
        const gem = eligibility?.location;
        if (!gem) return;
        setSuggestedHours(gem.opening_hours || '');
        setSuggestedPhone(gem.phone || '');
        setSuggestedWebsite(gem.website || '');
        setSuggestedDescription(gem.description || '');
    };

    const handleReasonContinue = () => {
        if (!reason) {
            setMessage('Please choose a reason.');
            setMessageType('error');
            return;
        }
        setMessage('');
        const meta = REASONS.find((r) => r.value === reason);
        if (meta?.requiresLocation) {
            setStep('location');
        } else if (reason === 'inappropriate_content') {
            prefillFromGem();
            setStep('corrections');
        } else {
            setStep('form');
        }
    };

    const contactChanged = () => {
        const gem = eligibility?.location || {};
        return (suggestedHours || '') !== (gem.opening_hours || '')
            || (suggestedPhone || '') !== (gem.phone || '')
            || (suggestedWebsite || '') !== (gem.website || '');
    };

    const descriptionChanged = () => {
        const gem = eligibility?.location || {};
        return isVotingGem && (suggestedDescription || '').trim() !== (gem.description || '').trim();
    };

    const handleCorrectionsContinue = () => {
        if (wantLocationFix && !suggestedCoords) {
            setMessage('');
            setStep('location');
            return;
        }
        if (!contactChanged() && !descriptionChanged() && !suggestedCoords) {
            setMessage(isVotingGem
                ? 'Change at least one thing — location, description or contact info.'
                : 'Change at least one contact field so the community knows what needs fixing.');
            setMessageType('error');
            return;
        }
        setMessage('');
        setStep('form');
    };

    const getCurrentLocation = () => {
        setCheckingLocation(true);
        setGpsStatus('Getting your location...');
        setMessage('');

        if (!navigator.geolocation) {
            setGpsStatus('error: Geolocation is not supported by your browser');
            setCheckingLocation(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;

                setSuggestedCoords({ latitude, longitude });
                setGpsStatus('success: Location found!');
                setMessageType('success');

                if (reason === 'inappropriate_content') {
                    setStep('corrections');
                } else {
                    setStep('form');
                }

                setCheckingLocation(false);
            },
            (error) => {
                setGpsStatus(
                    'error: Unable to get your location. ' +
                    (error.message || '')
                );
                setMessageType('error');
                setCheckingLocation(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0,
            }
        );
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

            if (suggestedCoords) {
                formData.append('reporter_latitude', suggestedCoords.latitude);
                formData.append('reporter_longitude', suggestedCoords.longitude);
            }

            if (reason === 'inappropriate_content') {
                const gem = eligibility?.location || {};
                if ((suggestedHours || '') !== (gem.opening_hours || '')) {
                    formData.append('suggested_opening_hours', suggestedHours);
                }
                if ((suggestedPhone || '') !== (gem.phone || '')) {
                    formData.append('suggested_phone', suggestedPhone);
                }
                if ((suggestedWebsite || '') !== (gem.website || '')) {
                    formData.append('suggested_website', suggestedWebsite);
                }
                if (descriptionChanged()) {
                    formData.append('suggested_description', suggestedDescription);
                }
                if (suggestedCoords) {
                    formData.append('suggested_latitude', suggestedCoords.latitude);
                    formData.append('suggested_longitude', suggestedCoords.longitude);
                }
            }

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
        setSuggestedHours('');
        setSuggestedPhone('');
        setSuggestedWebsite('');
        setSuggestedDescription('');
        setWantLocationFix(false);
        setSuggestedCoords(null);
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
        navigate('/login');
    };

    if (!isOpen) return null;

    // The backend returns which reasons apply to this gem's status.
    const availableReasons = eligibility?.reasons
        ? REASONS.filter((r) => eligibility.reasons.includes(r.value))
        : REASONS;
    const selectedReasonMeta = REASONS.find((r) => r.value === reason);
    const backFromLocation = reason === 'inappropriate_content' ? 'corrections' : 'reason';

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
                                        {selectedReasonMeta.requiresLocation
                                            ? "You'll need to share your current GPS location so the server can verify that you are nearby."
                                            : isVotingGem
                                                ? "On the next step, suggest the correct location, description or contact details."
                                                : "On the next step, enter the corrected contact details."}
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

                    {step === 'location' && (
                        <div className="vote-checkin">
                            <h3>Current Location Required</h3>
                            <p>
                                {reason === 'inappropriate_content'
                                    ? "Use your current GPS position as the suggested correct location."
                                    : 'Use your current GPS position so the server can verify that you are near this hidden gem.'}
                            </p>

                            {gemLocation && (
                                <div className="vote-checkin-location">
                                    <p className="vote-checkin-location-name">{gemLocation.place_name}</p>
                                    <p className="vote-checkin-location-address">{gemLocation.address}</p>
                                </div>
                            )}

                            <p className="vote-checkin-hint">
                                Your coordinates are submitted with the report for server-side verification. No check-in record is saved.
                            </p>

                            <div className="vote-checkin-options">
                                <button
                                    className="vote-checkin-option"
                                    onClick={getCurrentLocation}
                                    disabled={checkingLocation}
                                >
                                    <span className="vote-checkin-option-label">
                                        {checkingLocation ? 'Detecting Location...' : 'Use My Current Location'}
                                    </span>
                                    <span className="vote-checkin-option-desc">
                                        Detect your current GPS position
                                    </span>
                                </button>
                            </div>

                            {gpsStatus && (
                                <div className={`vote-gps-status ${gpsStatus.startsWith('error:') ? 'error' : 'success'}`}>
                                    {gpsStatus.replace(/^(error:|success:)/, '')}
                                </div>
                            )}

                            {message && <div className={`vote-message ${messageType}`}>{message}</div>}

                            <button className="vote-manual-back" onClick={() => setStep(backFromLocation)}>
                                ← Back
                            </button>
                            <button className="vote-btn-secondary" onClick={handleClose}>
                                Cancel
                            </button>
                        </div>
                    )}

                    {step === 'corrections' && (
                        <div className="vote-form">
                            <div className="vote-location-info">
                                <p>{gemLocation?.place_name}</p>
                                <p className="vote-location-address">{gemLocation?.address}</p>
                            </div>

                            <div className="vote-form-group">
                                <label>What's the correct information?</label>
                                <p className="report-reason-hint" style={{ margin: '0 0 10px' }}>
                                    Fill in what you know is right. Leave anything that's already correct as-is.
                                    Voters see your suggestion; if the community confirms it, the owner applies it.
                                </p>

                                {isVotingGem && (
                                    <>
                                        <label className="report-contact-label">Location</label>
                                        {suggestedCoords ? (
                                            <p className="report-reason-hint" style={{ margin: '0 0 8px' }}>
                                                ✓ Correct location captured from your current GPS position
                                                ({suggestedCoords.latitude.toFixed(5)}, {suggestedCoords.longitude.toFixed(5)}).{' '}
                                                <button type="button" className="vote-link-btn" onClick={() => { setSuggestedCoords(null); setWantLocationFix(false); }}>Undo</button>
                                            </p>
                                        ) : (
                                            <label className="report-flag-option" style={{ marginBottom: 8 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={wantLocationFix}
                                                    onChange={(e) => setWantLocationFix(e.target.checked)}
                                                />
                                                <span>The pin is in the wrong place — use my current GPS position</span>
                                            </label>
                                        )}

                                        <label className="report-contact-label">Description</label>
                                        <textarea
                                            className="vote-textarea"
                                            placeholder="The correct description of this place"
                                            value={suggestedDescription}
                                            onChange={(e) => setSuggestedDescription(e.target.value)}
                                            maxLength={2000}
                                        />
                                    </>
                                )}

                                <label className="report-contact-label">Opening hours</label>
                                <input
                                    type="text"
                                    className="vote-manual-input"
                                    placeholder="e.g. 9am – 6pm, closed Mondays"
                                    value={suggestedHours}
                                    onChange={(e) => setSuggestedHours(e.target.value)}
                                    maxLength={255}
                                />

                                <label className="report-contact-label">Phone</label>
                                <input
                                    type="text"
                                    className="vote-manual-input"
                                    placeholder="e.g. 012-345 6789"
                                    value={suggestedPhone}
                                    onChange={(e) => setSuggestedPhone(e.target.value)}
                                    maxLength={30}
                                />

                                <label className="report-contact-label">Website</label>
                                <input
                                    type="url"
                                    className="vote-manual-input"
                                    placeholder="https://…"
                                    value={suggestedWebsite}
                                    onChange={(e) => setSuggestedWebsite(e.target.value)}
                                    maxLength={255}
                                />
                            </div>

                            {message && <div className={`vote-message ${messageType}`}>{message}</div>}

                            <button className="vote-manual-back" onClick={() => setStep('reason')}>← Back to reason</button>

                            <div className="vote-actions">
                                <button className="vote-btn-primary" onClick={handleCorrectionsContinue}>
                                    {wantLocationFix && !suggestedCoords ? 'Detect current location' : 'Continue'}
                                </button>
                                <button className="vote-btn-secondary" onClick={handleClose}>Cancel</button>
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
                                {reason === 'inappropriate_content' && (
                                    <div className="report-summary-desc">
                                        {suggestedCoords && <p>Location → {suggestedCoords.latitude.toFixed(5)}, {suggestedCoords.longitude.toFixed(5)}</p>}
                                        {descriptionChanged() && <p>Description → updated</p>}
                                        {suggestedHours && <p>Hours → {suggestedHours}</p>}
                                        {suggestedPhone && <p>Phone → {suggestedPhone}</p>}
                                        {suggestedWebsite && <p>Website → {suggestedWebsite}</p>}
                                    </div>
                                )}
                            </div>

                            <div className="vote-form-group">
                                <label>Details (optional)</label>
                                <textarea
                                    className="vote-textarea"
                                    placeholder="Add any context that would help others verify this..."
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

                            <button
                                className="vote-manual-back"
                                onClick={() => setStep(reason === 'inappropriate_content' ? 'corrections' : 'reason')}
                            >
                                ← {reason === 'inappropriate_content' ? 'Change the corrections' : 'Change reason'}
                            </button>

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
