import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { checkVerifyEligibility, verifyReport } from '@/features/community/reportsApi';
import { loginNavOptions } from '@/utils/auth/authRedirect';
import { checkIn as postCheckIn } from '@/features/community/votesApi';

const REASON_LABELS = {
    permanently_closed: 'Permanently closed',
    incorrect_contact_info: 'Contact info is wrong (hours / phone / website)',
};

function VerifyReportModal({ report, reports = null, isOpen, onClose, onVerifySuccess, onReportInstead }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [picked, setPicked] = useState(null);
    const [step, setStep] = useState('checking');
    const [loading, setLoading] = useState(false);
    const [eligibility, setEligibility] = useState(null);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('error');
    const [checkingIn, setCheckingIn] = useState(false);
    const [gpsStatus, setGpsStatus] = useState('');

    const target = picked ?? report;

    useEffect(() => {
        if (isOpen && target) {
            checkEligibility();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, target?.id]);

    const checkEligibility = async () => {
        setLoading(true);
        setStep('checking');
        try {
            const res = await checkVerifyEligibility(target.id);
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
        setGpsStatus('Getting your location…');
        setMessage('');
        if (!navigator.geolocation) {
            setGpsStatus('error: Your browser can\'t share your location, so this report can\'t be verified from here.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setGpsStatus('success: Location found — checking you in…');
                performCheckIn(position.coords.latitude, position.coords.longitude);
            },
            (error) => setGpsStatus('error: ' + (error.code === 1
                ? 'Location permission denied. Allow location access to verify this report.'
                : ('Couldn\'t get your location. ' + (error.message || '')))),
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

    const handleVerdict = async (verdict) => {
        setLoading(true);
        setMessage('');
        try {
            const res = await verifyReport(target.id, { verdict });
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
        setMessage('');
        setEligibility(null);
        setGpsStatus('');
        setPicked(null);
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

    // Two reasons can be open at once and each is voted on separately, so ask
    if (!picked && Array.isArray(reports) && reports.length > 1) {
        return createPortal((
            <div className="vote-modal-overlay" onClick={(e) => { e.stopPropagation(); handleClose(); }}>
                <div className="vote-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="vote-modal-header">
                        <h2>Which report?</h2>
                        <button className="vote-modal-close" onClick={handleClose}>✕</button>
                    </div>
                    <div className="vote-modal-body">
                        <div className="vote-form">
                            <div className="vote-location-info">
                                <p>This place has more than one report under review.</p>
                                <p className="vote-location-address">Each is settled by its own vote.</p>
                            </div>
                            <div className="vote-actions">
                                {reports.map((r) => (
                                    <button
                                        key={r.id}
                                        className="vote-btn-secondary"
                                        onClick={() => setPicked(r)}
                                        disabled={!r.can_verify}
                                    >
                                        {r.reason_label || r.reason}
                                        {!r.can_verify && ' — you already voted'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        ), document.body);
    }

    if (!target) return null;

    const gemLocation = eligibility?.location;

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
                            <button className="vote-btn-secondary" onClick={handleClose}>Cancel</button>
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

                                {report.photo_path && (
                                    <a
                                        href={report.photo_path}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="report-evidence-photo"
                                    >
                                        <img src={report.photo_path} alt="Evidence from the reporter" />
                                        <span>Reporter's evidence — tap to view full size</span>
                                    </a>
                                )}

                                {report.reason === 'permanently_closed' && (
                                    <p className="report-summary-desc">
                                        Confirm only if you've seen it closed for good. If confirmed, the gem stays
                                        listed but is greyed out and marked "Permanently closed".
                                    </p>
                                )}

                                {report.reason === 'incorrect_contact_info' && (
                                    <div className="report-contact-diff">
                                        <p className="report-summary-desc">
                                            Current contact info:
                                        </p>
                                        <div className="report-contact-diff-row">
                                            <span className="report-contact-diff-label">Hours</span>
                                            <span className="report-contact-diff-old">{gemLocation?.opening_hours || '—'}</span>
                                        </div>
                                        <div className="report-contact-diff-row">
                                            <span className="report-contact-diff-label">Phone</span>
                                            <span className="report-contact-diff-old">{gemLocation?.phone || '—'}</span>
                                        </div>
                                        <div className="report-contact-diff-row">
                                            <span className="report-contact-diff-label">Website</span>
                                            <span className="report-contact-diff-old">{gemLocation?.website || '—'}</span>
                                        </div>
                                        <p className="report-summary-desc">
                                            If confirmed, a warning shows next to the contact info until the owner
                                            corrects it. Nothing changes if disputed.
                                        </p>
                                    </div>
                                )}
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
                            {onReportInstead && (
                                <button className="vote-btn-secondary" onClick={onReportInstead}>
                                    Report a different issue instead
                                </button>
                            )}
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
                            {onReportInstead && !message.includes('login') && (
                                <button className="vote-btn-secondary" onClick={onReportInstead}>
                                    Report a different issue instead
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    ), document.body);
}

export default VerifyReportModal;
