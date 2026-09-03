import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { checkReportEligibility, submitReport } from '../api/reports';
import { checkIn as postCheckIn } from '../api/votes';

// A Hidden Gem — verified, or still in community voting — can be reported for
// two things (see Report::REASONS). The backend returns which reasons apply to
// this gem's status; `inappropriate_content` also covers more on a gem still
// in voting (location + description, not just contact info).
const REASONS = [
    { value: 'permanently_closed', label: 'Permanently closed', requiresLocation: true },
    { value: 'inappropriate_content', label: 'Information is wrong', requiresLocation: false },
];

// checking -> reason -> [checkin -> manual_checkin] -> [corrections] -> form -> success/error.
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
    // Captured during the check-in step — becomes the suggested correct pin.
    const [suggestedCoords, setSuggestedCoords] = useState(null);
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
        if (meta?.requiresLocation && !eligibility?.has_check_in) {
            setStep('checkin');
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
        // The pin fix needs a check-in first.
        if (wantLocationFix && !suggestedCoords) {
            setMessage('');
            setStep('checkin');
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
            if (reason === 'inappropriate_content') {
                // The check-in position is the reporter's proposed correct pin.
                setSuggestedCoords({ latitude, longitude });
                setStep('corrections');
            } else {
                setStep('form');
            }
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

    // The backend returns which reasons apply to this gem's status.
    const availableReasons = eligibility?.reasons
        ? REASONS.filter((r) => eligibility.reasons.includes(r.value))
        : REASONS;
    const selectedReasonMeta = REASONS.find((r) => r.value === reason);
    const backFromCheckin = reason === 'inappropriate_content' ? 'corrections' : 'reason';

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
                                            ? "You'll need to check in at this location — you have to have actually been there to know this."
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

                    {step === 'checkin' && (
                        <div className="vote-checkin">
                            <h3>Check-in Required</h3>
                            <p>
                                {reason === 'inappropriate_content'
                                    ? "We'll use your check-in position as the suggested correct location — the community votes on whether it looks right."
                                    : 'This reason needs you to have actually been at the location — check in before you can report it.'}
                            </p>

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

                            <button className="vote-manual-back" onClick={() => setStep(backFromCheckin)}>← Back</button>
                            <button className="vote-btn-secondary" onClick={handleClose}>Cancel</button>
                        </div>
                    )}

                    {step === 'manual_checkin' && (
                        <div className="vote-manual-checkin">
                            <button className="vote-manual-back" onClick={() => setStep('checkin')}>← Back</button>
                            <h3>Enter Your Current Location</h3>
                            {reason === 'inappropriate_content' && (
                                <p className="vote-manual-hint">These coordinates will be suggested as the gem's correct location.</p>
                            )}

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
                                                ✓ Correct location captured from your check-in
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
                                                <span>The pin is in the wrong place — I'll check in to set the right spot</span>
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
                                    {wantLocationFix && !suggestedCoords ? 'Check in to set location' : 'Continue'}
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
