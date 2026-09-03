import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { checkVerifyEligibility, verifyReport } from '../api/reports';
import { checkIn as postCheckIn } from '../api/votes';

const REASON_LABELS = {
    permanently_closed: 'Permanently closed',
    inappropriate_content: 'Contact info is wrong (hours / phone / website)',
};

function VerifyReportModal({ report, isOpen, onClose, onVerifySuccess }) {
    const navigate = useNavigate();
    const [step, setStep] = useState('checking');
    const [loading, setLoading] = useState(false);
    const [eligibility, setEligibility] = useState(null);
    const [comment, setComment] = useState('');
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('error');
    const [checkingIn, setCheckingIn] = useState(false);
    const [gpsStatus, setGpsStatus] = useState('');
    const [manualLat, setManualLat] = useState('');
    const [manualLng, setManualLng] = useState('');

    useEffect(() => {
        if (isOpen && report) {
            checkEligibility();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, report?.id]);

    const checkEligibility = async () => {
        setLoading(true);
        setStep('checking');
        try {
            const res = await checkVerifyEligibility(report.id);
            const data = res.data;
            setEligibility(data);
            if (data.eligible) {
                setStep(data.has_check_in ? 'vote' : 'checkin');
            } else {
                setStep('error');
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

    const getCurrentLocation = () => {
        setGpsStatus('Getting your location...');
        if (!navigator.geolocation) {
            setGpsStatus('error: Geolocation is not supported by your browser');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setGpsStatus('success: Location found!');
                performCheckIn(position.coords.latitude, position.coords.longitude);
            },
            (error) => setGpsStatus('error: Unable to get your location. ' + (error.message || '')),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    };

    const performCheckIn = async (latitude, longitude) => {
        setCheckingIn(true);
        setMessage('');
        try {
            const res = await postCheckIn(eligibility.location.id, { latitude, longitude });
            setEligibility((prev) => ({ ...prev, has_check_in: true }));
            setStep('vote');
            const distanceMsg = res.data.distance ? ` (${res.data.distance} km away)` : '';
            setMessage('Check-in successful!' + distanceMsg);
            setMessageType('success');
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

    const handleVerdict = async (verdict) => {
        setLoading(true);
        setMessage('');
        try {
            const res = await verifyReport(report.id, { verdict, comment: comment || undefined });
            setStep('success');
            setMessage(res.data.message);
            onVerifySuccess?.(res.data);
        } catch (error) {
            setMessage(error?.response?.data?.message || 'Failed to record vote');
            setMessageType('error');
            setStep('error');
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setStep('checking');
        setComment('');
        setMessage('');
        setEligibility(null);
        setGpsStatus('');
        setManualLat('');
        setManualLng('');
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const goToLogin = () => {
        handleClose();
        navigate('/login');
    };

    if (!isOpen || !report) return null;

    const gemLocation = eligibility?.location;
    const suggestedContact = report.reason === 'inappropriate_content'
        ? [
            report.suggested_latitude != null && {
                label: 'Location',
                current: gemLocation ? `${Number(gemLocation.latitude).toFixed(5)}, ${Number(gemLocation.longitude).toFixed(5)}` : '—',
                suggested: `${Number(report.suggested_latitude).toFixed(5)}, ${Number(report.suggested_longitude).toFixed(5)}`,
            },
            report.suggested_description && {
                label: 'Description',
                current: gemLocation?.description,
                suggested: report.suggested_description,
            },
            { label: 'Hours', current: gemLocation?.opening_hours, suggested: report.suggested_opening_hours },
            { label: 'Phone', current: gemLocation?.phone, suggested: report.suggested_phone },
            { label: 'Website', current: gemLocation?.website, suggested: report.suggested_website },
        ].filter((row) => row && row.suggested)
        : [];

    // Portaled to <body> — see ReportModal.jsx for why (a hovered ancestor
    // card's :hover transform would otherwise hijack this fixed-position
    // modal's containing block, making it snap between full-screen and
    // pinned-to-the-card).
    return createPortal((
        <div className="vote-modal-overlay" onClick={(e) => { e.stopPropagation(); handleClose(); }}>
            <div className="vote-modal" onClick={(e) => e.stopPropagation()}>
                <div className="vote-modal-header">
                    <h2>Verify Report</h2>
                    <button className="vote-modal-close" onClick={handleClose}>✕</button>
                </div>

                <div className="vote-modal-body">
                    {step === 'checking' && (
                        <div className="vote-loading">
                            <div className="vote-loading-spinner"></div>
                            <p>Checking eligibility...</p>
                        </div>
                    )}

                    {step === 'checkin' && (
                        <div className="vote-checkin">
                            <h3>Check-in Required</h3>
                            <p>You need to check-in at this location before you can verify this report.</p>
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

                    {step === 'vote' && (
                        <div className="vote-form">
                            <div className="vote-location-info">
                                <p>{eligibility?.location?.place_name}</p>
                                <p className="vote-location-address">{eligibility?.location?.address}</p>
                            </div>

                            <div className="report-summary">
                                <span className="report-summary-label">Reported for</span>
                                <strong>{REASON_LABELS[report.reason] || report.reason}</strong>
                                {report.description && <p className="report-summary-desc">"{report.description}"</p>}

                                {report.reason === 'permanently_closed' && (
                                    <p className="report-summary-desc">
                                        Confirm only if you've seen it closed for good. If confirmed, the gem stays
                                        listed but is greyed out and marked "Permanently closed".
                                    </p>
                                )}

                                {report.reason === 'inappropriate_content' && (
                                    <div className="report-contact-diff">
                                        {suggestedContact.length === 0 ? (
                                            <p className="report-summary-desc">The reporter flagged the contact info but suggested no replacement.</p>
                                        ) : suggestedContact.map((row) => (
                                            <div key={row.label} className="report-contact-diff-row">
                                                <span className="report-contact-diff-label">{row.label}</span>
                                                <span className="report-contact-diff-old">{row.current || '—'}</span>
                                                <span className="report-contact-diff-arrow">→</span>
                                                <span className="report-contact-diff-new">{row.suggested}</span>
                                            </div>
                                        ))}
                                        <p className="report-summary-desc">
                                            {gemLocation?.status === 'pending_community_vote'
                                                ? 'If confirmed, the owner fixes it and the gem is re-submitted (fresh AI review + a new community vote). Nothing changes if disputed.'
                                                : 'If confirmed, the owner can apply this correction. Nothing changes if disputed.'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="vote-form-group">
                                <label>Comment (optional)</label>
                                <textarea
                                    className="vote-textarea"
                                    placeholder='What did you find when you visited?'
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    maxLength={1000}
                                />
                                <span className="vote-char-count">{comment.length}/1000</span>
                            </div>

                            {message && <div className={`vote-message ${messageType}`}>{message}</div>}

                            <div className="report-verdict-actions">
                                <button className="report-verdict-btn report-verdict-dispute" onClick={() => handleVerdict('dispute')} disabled={loading}>
                                    ✓ This is fine — dispute report
                                </button>
                                <button className="report-verdict-btn report-verdict-confirm" onClick={() => handleVerdict('confirm')} disabled={loading}>
                                    ⚠ Confirm — issue is real
                                </button>
                            </div>
                            <button className="vote-btn-secondary" onClick={handleClose}>Cancel</button>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="vote-success">
                            <h3>Vote Recorded</h3>
                            <p>{message}</p>
                            <button className="vote-btn-primary" onClick={handleClose}>Close</button>
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="vote-error">
                            <h3>Cannot Verify</h3>
                            <p>{message}</p>
                            {message.includes('login') ? (
                                <button className="vote-btn-primary" onClick={goToLogin}>Login to Verify</button>
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

export default VerifyReportModal;
