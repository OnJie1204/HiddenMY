import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { checkReportEligibility, submitReport } from '../api/reports';
import { checkIn as postCheckIn } from '../api/votes';

// Only categories a visitor can actually confirm or dispute from what they
// see at the gem — see Report::REASONS on the backend for why this list is
// fixed rather than freeform. `requiresLocation` mirrors
// Report::LOCATION_REQUIRED_REASONS: a closed shop or a wrong pin needs eyes
// on the ground, but a viral gem, a duplicate listing, or an offensive photo
// can be judged from what's already published — no need to demand a check-in
// for those.
const REASONS = [
    { value: 'permanently_closed', label: 'Permanently closed', requiresLocation: true },
    { value: 'incorrect_location', label: 'Incorrect location', requiresLocation: true },
    { value: 'not_actually_hidden', label: 'No longer hidden (gone viral / well known)', requiresLocation: false },
    { value: 'duplicate', label: 'Duplicate of another gem', requiresLocation: false },
    { value: 'inappropriate_content', label: 'Inappropriate content', requiresLocation: false },
];

// checking -> reason -> [checkin -> manual_checkin] -> [flag-item] -> form -> success/error.
// The check-in step only appears if the chosen reason actually needs it, and
// the flag-item step only appears for inappropriate_content (it's the only
// reason with a specific photo/description to point at).
function ReportModal({ locationId, isOpen, onClose, onReportSuccess }) {
    const navigate = useNavigate();
    const [step, setStep] = useState('checking');
    const [loading, setLoading] = useState(false);
    const [eligibility, setEligibility] = useState(null);
    const [reason, setReason] = useState('');
    const [flaggedItem, setFlaggedItem] = useState('');
    const [description, setDescription] = useState('');
    const [photo, setPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [message, setMessage] = useState('');
    const [checkingIn, setCheckingIn] = useState(false);
    const [gpsStatus, setGpsStatus] = useState('');
    const [manualLat, setManualLat] = useState('');
    const [manualLng, setManualLng] = useState('');
    // incorrect_location: the coordinates captured during THIS check-in step
    // become the suggested correction — the reporter already has to stand
    // within 5km to file this reason, so their GPS position is a ready-made
    // candidate for the correct pin. check_ins itself never stores
    // coordinates (used once for the distance check, then discarded), so
    // this is captured here independently and sent along with the report.
    const [suggestedCoords, setSuggestedCoords] = useState(null);
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
            // Eligibility here is reason-agnostic (login, not your own gem,
            // no report already open) — which reasons need a check-in is
            // decided once the traveller actually picks one, below.
            setStep(data.eligible ? 'reason' : 'error');
            if (!data.eligible) setMessage(data.message);
        } catch (error) {
            setStep('error');
            setMessage(error?.response?.data?.message || 'Unable to check eligibility');
        } finally {
            setLoading(false);
        }
    };

    const handleReasonContinue = () => {
        if (!reason) {
            setMessage('Please choose a reason.');
            return;
        }
        setMessage('');
        const meta = REASONS.find((r) => r.value === reason);
        if (meta?.requiresLocation && !eligibility?.has_check_in) {
            setStep('checkin');
        } else if (reason === 'inappropriate_content') {
            setStep('flag-item');
        } else {
            setStep('form');
        }
    };

    const handleFlagItemContinue = () => {
        if (!flaggedItem) {
            setMessage('Please choose what needs fixing.');
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
            setSuggestedCoords({ latitude, longitude });
            setStep(reason === 'inappropriate_content' ? 'flag-item' : 'form');
            const distanceMsg = res.data.distance ? ` (${res.data.distance} km away)` : '';
            setMessage('Check-in successful!' + distanceMsg);
        } catch (error) {
            const data = error?.response?.data;
            if (data?.distance && data?.max_distance) {
                setMessage(`You are ${data.distance} km away. You must be within ${data.max_distance} km to check in.`);
            } else {
                setMessage(data?.message || 'Check-in failed');
            }
        } finally {
            setCheckingIn(false);
        }
    };

    const confirmManualCheckIn = () => {
        const lat = parseFloat(manualLat);
        const lng = parseFloat(manualLng);
        if (!manualLat || !manualLng || isNaN(lat) || isNaN(lng)) {
            setMessage('Please enter valid coordinates.');
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
            if (reason === 'incorrect_location' && suggestedCoords) {
                formData.append('suggested_latitude', suggestedCoords.latitude);
                formData.append('suggested_longitude', suggestedCoords.longitude);
            }
            if (reason === 'inappropriate_content' && flaggedItem) {
                formData.append('flagged_item', flaggedItem);
            }

            const res = await submitReport(locationId, formData);
            setStep('success');
            setMessage(res.data.message);
            onReportSuccess?.(res.data);
        } catch (error) {
            setMessage(error?.response?.data?.message || 'Failed to submit report');
            setStep('error');
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setStep('checking');
        setReason('');
        setFlaggedItem('');
        setDescription('');
        setPhoto(null);
        setPhotoPreview(null);
        setMessage('');
        setEligibility(null);
        setGpsStatus('');
        setManualLat('');
        setManualLng('');
        setSuggestedCoords(null);
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

    const gemLocation = eligibility?.location;
    const selectedReasonMeta = REASONS.find((r) => r.value === reason);
    const gemImages = gemLocation?.images || [];

    // Portaled to <body> — this modal is instantiated deep inside hoverable
    // gem cards (HiddenGems.jsx, Home.jsx, Wishlist.jsx, SidePanel), and
    // those cards apply a `transform` on :hover for a lift effect. A
    // transformed ancestor becomes the containing block for any
    // position:fixed descendant, so without portaling, hovering the card
    // underneath while this modal is open made it visually snap between
    // full-screen (no hover) and pinned/shrunk to the card's box (hover) —
    // rendering outside the card's subtree entirely avoids that.
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
                                    {REASONS.map((r) => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                                {selectedReasonMeta && (
                                    <p className="report-reason-hint">
                                        {selectedReasonMeta.requiresLocation
                                            ? "You'll need to check in at this location — you have to have actually been there to know this."
                                            : "No check-in needed — this can be judged from what's already published."}
                                    </p>
                                )}
                            </div>

                            {message && <div className="vote-message error">{message}</div>}

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
                                {reason === 'incorrect_location'
                                    ? "We'll use your check-in position as the suggested correct location — others will vote on whether it looks right."
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
                            {message && <div className="vote-message error">{message}</div>}

                            <button className="vote-manual-back" onClick={() => setStep('reason')}>← Back to reason</button>
                            <button className="vote-btn-secondary" onClick={handleClose}>Cancel</button>
                        </div>
                    )}

                    {step === 'manual_checkin' && (
                        <div className="vote-manual-checkin">
                            <button className="vote-manual-back" onClick={() => setStep('checkin')}>← Back</button>
                            <h3>Enter Your Current Location</h3>
                            {reason === 'incorrect_location' && (
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

                            {message && <div className="vote-message error">{message}</div>}

                            <div className="vote-actions">
                                <button className="vote-btn-primary" onClick={confirmManualCheckIn} disabled={checkingIn}>
                                    {checkingIn ? 'Checking in...' : 'Confirm Check-in'}
                                </button>
                                <button className="vote-btn-secondary" onClick={() => setStep('checkin')}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {step === 'flag-item' && (
                        <div className="vote-form">
                            <div className="vote-location-info">
                                <p>{gemLocation?.place_name}</p>
                                <p className="vote-location-address">{gemLocation?.address}</p>
                            </div>

                            <div className="vote-form-group">
                                <label>What exactly is inappropriate?</label>
                                <p className="report-reason-hint" style={{ margin: '0 0 10px' }}>
                                    Pick the specific thing, so the owner knows exactly what to fix.
                                </p>

                                <div className="report-flag-options">
                                    <label className={`report-flag-option ${flaggedItem === 'description' ? 'active' : ''}`}>
                                        <input
                                            type="radio"
                                            name="flagged-item"
                                            value="description"
                                            checked={flaggedItem === 'description'}
                                            onChange={(e) => setFlaggedItem(e.target.value)}
                                        />
                                        <span>The description text</span>
                                    </label>

                                    {gemImages.map((img) => (
                                        <label
                                            key={img.id}
                                            className={`report-flag-option report-flag-option-photo ${flaggedItem === String(img.id) ? 'active' : ''}`}
                                        >
                                            <input
                                                type="radio"
                                                name="flagged-item"
                                                value={String(img.id)}
                                                checked={flaggedItem === String(img.id)}
                                                onChange={(e) => setFlaggedItem(e.target.value)}
                                            />
                                            <img src={img.image_url} alt="" />
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {message && <div className="vote-message error">{message}</div>}

                            <button className="vote-manual-back" onClick={() => setStep('reason')}>← Back to reason</button>

                            <div className="vote-actions">
                                <button className="vote-btn-primary" onClick={handleFlagItemContinue} disabled={!flaggedItem}>
                                    Continue
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
                                {reason === 'incorrect_location' && suggestedCoords && (
                                    <p className="report-summary-desc">
                                        Suggested location: {suggestedCoords.latitude.toFixed(5)}, {suggestedCoords.longitude.toFixed(5)}
                                    </p>
                                )}
                                {reason === 'inappropriate_content' && (
                                    <p className="report-summary-desc">
                                        Flagged: {flaggedItem === 'description' ? 'the description text' : 'a photo'}
                                    </p>
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

                            {message && <div className="vote-message error">{message}</div>}

                            <button
                                className="vote-manual-back"
                                onClick={() => setStep(reason === 'inappropriate_content' ? 'flag-item' : 'reason')}
                            >
                                ← {reason === 'inappropriate_content' ? 'Change what\'s flagged' : 'Change reason'}
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
