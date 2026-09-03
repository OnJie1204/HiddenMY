import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    checkVerifyEligibility,
    verifyReport,
} from '../api/reports';

const REASON_LABELS = {
    permanently_closed: 'Permanently closed',
    inappropriate_content: 'Information is wrong',
};

function VerifyReportModal({
    report,
    isOpen,
    onClose,
    onVerifySuccess,
}) {
    const navigate = useNavigate();

    const [step, setStep] = useState('checking');
    const [loading, setLoading] = useState(false);
    const [eligibility, setEligibility] = useState(null);
    const [comment, setComment] = useState('');
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('error');
    const [gpsStatus, setGpsStatus] = useState('');
    const [checkingLocation, setCheckingLocation] = useState(false);
    const [currentLocation, setCurrentLocation] = useState(null);

    useEffect(() => {
        if (isOpen && report) {
            checkEligibility();
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, report?.id]);

    const checkEligibility = async () => {
        setLoading(true);
        setStep('checking');
        setMessage('');
        setGpsStatus('');
        setCurrentLocation(null);

        try {
            const res = await checkVerifyEligibility(report.id);
            const data = res.data;

            setEligibility(data);

            if (!data.eligible) {
                setStep('error');
                setMessage(data.message);
                setMessageType('error');
                return;
            }

            if (data.requires_location_verification) {
                setStep('location');
            } else {
                setStep('vote');
            }
        } catch (error) {
            setStep('error');
            setMessage(
                error?.response?.data?.message
                || 'Unable to check eligibility'
            );
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    };

    const getCurrentLocation = () => {
        setCheckingLocation(true);
        setGpsStatus('Getting your location...');
        setMessage('');

        if (!navigator.geolocation) {
            setGpsStatus(
                'error: Geolocation is not supported by your browser'
            );
            setCheckingLocation(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const {
                    latitude,
                    longitude,
                } = position.coords;

                setCurrentLocation({
                    latitude,
                    longitude,
                });

                setGpsStatus(
                    'success: Location found. The server will verify your distance when you submit your verdict.'
                );

                setMessage('');
                setMessageType('success');
                setStep('vote');
                setCheckingLocation(false);
            },
            (error) => {
                setGpsStatus(
                    'error: Unable to get your location. '
                    + (error.message || '')
                );
                setCheckingLocation(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0,
            }
        );
    };

    const handleVerdict = async (verdict) => {
        setLoading(true);
        setMessage('');

        try {
            const payload = {
                verdict,
                comment: comment || undefined,
            };

            if (
                eligibility?.requires_location_verification
            ) {
                if (!currentLocation) {
                    setStep('location');
                    setMessage(
                        'Please detect your current location first.'
                    );
                    setMessageType('error');
                    setLoading(false);
                    return;
                }

                payload.latitude =
                    currentLocation.latitude;
                payload.longitude =
                    currentLocation.longitude;
            }

            const res = await verifyReport(
                report.id,
                payload
            );

            setStep('success');
            setMessage(res.data.message);
            setMessageType('success');

            onVerifySuccess?.(res.data);
        } catch (error) {
            const data = error?.response?.data;

            if (
                data?.distance !== undefined
                && data?.max_distance !== undefined
            ) {
                setMessage(
                    `You are ${data.distance} km away. You must be within ${data.max_distance} km to verify this report.`
                );
                setMessageType('error');
                setStep('location');
                setCurrentLocation(null);
                return;
            }

            setMessage(
                data?.message
                || 'Failed to record vote'
            );
            setMessageType('error');
            setStep('error');
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setStep('checking');
        setLoading(false);
        setEligibility(null);
        setComment('');
        setMessage('');
        setMessageType('error');
        setGpsStatus('');
        setCheckingLocation(false);
        setCurrentLocation(null);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const goToLogin = () => {
        handleClose();
        navigate('/login');
    };

    if (!isOpen || !report) {
        return null;
    }

    const gemLocation = eligibility?.location;

    const suggestedContact =
        report.reason === 'inappropriate_content'
            ? [
                report.suggested_latitude != null
                && report.suggested_longitude != null
                    ? {
                        label: 'Location',
                        current: gemLocation
                            ? `${Number(gemLocation.latitude).toFixed(5)}, ${Number(gemLocation.longitude).toFixed(5)}`
                            : '—',
                        suggested:
                            `${Number(report.suggested_latitude).toFixed(5)}, ${Number(report.suggested_longitude).toFixed(5)}`,
                    }
                    : null,
                report.suggested_description
                    ? {
                        label: 'Description',
                        current:
                            gemLocation?.description,
                        suggested:
                            report.suggested_description,
                    }
                    : null,
                report.suggested_opening_hours
                    ? {
                        label: 'Hours',
                        current:
                            gemLocation?.opening_hours,
                        suggested:
                            report.suggested_opening_hours,
                    }
                    : null,
                report.suggested_phone
                    ? {
                        label: 'Phone',
                        current:
                            gemLocation?.phone,
                        suggested:
                            report.suggested_phone,
                    }
                    : null,
                report.suggested_website
                    ? {
                        label: 'Website',
                        current:
                            gemLocation?.website,
                        suggested:
                            report.suggested_website,
                    }
                    : null,
            ].filter(Boolean)
            : [];

    return createPortal(
        (
            <div
                className="vote-modal-overlay"
                onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                }}
            >
                <div
                    className="vote-modal"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="vote-modal-header">
                        <h2>Verify Report</h2>

                        <button
                            className="vote-modal-close"
                            onClick={handleClose}
                        >
                            ✕
                        </button>
                    </div>

                    <div className="vote-modal-body">
                        {step === 'checking' && (
                            <div className="vote-loading">
                                <div className="vote-loading-spinner"></div>
                                <p>
                                    Checking eligibility...
                                </p>
                            </div>
                        )}

                        {step === 'location' && (
                            <div className="vote-checkin">
                                <h3>
                                    Current Location Required
                                </h3>

                                <p>
                                    This report requires real-time location verification before you can confirm or dispute it.
                                </p>

                                {gemLocation && (
                                    <div className="vote-checkin-location">
                                        <p className="vote-checkin-location-name">
                                            {gemLocation.place_name}
                                        </p>

                                        <p className="vote-checkin-location-address">
                                            {gemLocation.address}
                                        </p>
                                    </div>
                                )}

                                <p className="vote-checkin-hint">
                                    You must be within {eligibility?.max_distance ?? 5} km. Your current coordinates are checked by the server and are not stored as a check-in.
                                </p>

                                <div className="vote-checkin-options">
                                    <button
                                        className="vote-checkin-option"
                                        onClick={getCurrentLocation}
                                        disabled={checkingLocation}
                                    >
                                        <span className="vote-checkin-option-label">
                                            {checkingLocation
                                                ? 'Detecting Location...'
                                                : 'Use My Current Location'}
                                        </span>

                                        <span className="vote-checkin-option-desc">
                                            Detect your current GPS position
                                        </span>
                                    </button>
                                </div>

                                {gpsStatus && (
                                    <div
                                        className={`vote-gps-status ${
                                            gpsStatus.startsWith('error:')
                                                ? 'error'
                                                : 'success'
                                        }`}
                                    >
                                        {gpsStatus.replace(
                                            /^(error:|success:)/,
                                            ''
                                        )}
                                    </div>
                                )}

                                {message && (
                                    <div
                                        className={`vote-message ${messageType}`}
                                    >
                                        {message}
                                    </div>
                                )}

                                <button
                                    className="vote-btn-secondary"
                                    onClick={handleClose}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}

                        {step === 'vote' && (
                            <div className="vote-form">
                                <div className="vote-location-info">
                                    <p>
                                        {eligibility?.location?.place_name}
                                    </p>

                                    <p className="vote-location-address">
                                        {eligibility?.location?.address}
                                    </p>
                                </div>

                                <div className="report-summary">
                                    <span className="report-summary-label">
                                        Reported for
                                    </span>

                                    <strong>
                                        {REASON_LABELS[report.reason]
                                            || report.reason}
                                    </strong>

                                    {report.description && (
                                        <p className="report-summary-desc">
                                            "{report.description}"
                                        </p>
                                    )}

                                    {report.reason === 'permanently_closed' && (
                                        <p className="report-summary-desc">
                                            Confirm only if you have seen that this place is permanently closed. If confirmed, the gem remains listed but is marked as permanently closed and interactions are frozen.
                                        </p>
                                    )}

                                    {report.reason === 'inappropriate_content' && (
                                        <div className="report-contact-diff">
                                            {suggestedContact.length === 0 ? (
                                                <p className="report-summary-desc">
                                                    The reporter flagged the information but suggested no replacement.
                                                </p>
                                            ) : (
                                                suggestedContact.map(
                                                    (row) => (
                                                        <div
                                                            key={row.label}
                                                            className="report-contact-diff-row"
                                                        >
                                                            <span className="report-contact-diff-label">
                                                                {row.label}
                                                            </span>

                                                            <span className="report-contact-diff-old">
                                                                {row.current || '—'}
                                                            </span>

                                                            <span className="report-contact-diff-arrow">
                                                                →
                                                            </span>

                                                            <span className="report-contact-diff-new">
                                                                {row.suggested}
                                                            </span>
                                                        </div>
                                                    )
                                                )
                                            )}

                                            <p className="report-summary-desc">
                                                {gemLocation?.status === 'pending_community_vote'
                                                    ? 'If confirmed, the owner can fix the reported information and the gem can go through the required review flow again.'
                                                    : 'If confirmed, the owner can apply the permitted correction. Nothing changes if the report is disputed.'}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {eligibility?.requires_location_verification && currentLocation && (
                                    <div className="vote-gps-status success">
                                        Current location captured. The server will verify the 5 km distance when you submit.
                                    </div>
                                )}

                                <div className="vote-form-group">
                                    <label>
                                        Comment (optional)
                                    </label>

                                    <textarea
                                        className="vote-textarea"
                                        placeholder="Add any context that would help the community verify this report..."
                                        value={comment}
                                        onChange={(e) =>
                                            setComment(
                                                e.target.value
                                            )
                                        }
                                        maxLength={1000}
                                    />

                                    <span className="vote-char-count">
                                        {comment.length}/1000
                                    </span>
                                </div>

                                {message && (
                                    <div
                                        className={`vote-message ${messageType}`}
                                    >
                                        {message}
                                    </div>
                                )}

                                <div className="report-verdict-actions">
                                    <button
                                        className="report-verdict-btn report-verdict-dispute"
                                        onClick={() =>
                                            handleVerdict(
                                                'dispute'
                                            )
                                        }
                                        disabled={loading}
                                    >
                                        ✓ This is fine — dispute report
                                    </button>

                                    <button
                                        className="report-verdict-btn report-verdict-confirm"
                                        onClick={() =>
                                            handleVerdict(
                                                'confirm'
                                            )
                                        }
                                        disabled={loading}
                                    >
                                        ⚠ Confirm — issue is real
                                    </button>
                                </div>

                                {eligibility?.requires_location_verification && (
                                    <button
                                        type="button"
                                        className="vote-manual-back"
                                        onClick={() =>
                                            setStep('location')
                                        }
                                        disabled={loading}
                                    >
                                        Detect location again
                                    </button>
                                )}

                                <button
                                    className="vote-btn-secondary"
                                    onClick={handleClose}
                                    disabled={loading}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}

                        {step === 'success' && (
                            <div className="vote-success">
                                <h3>
                                    Vote Recorded
                                </h3>

                                <p>
                                    {message}
                                </p>

                                <button
                                    className="vote-btn-primary"
                                    onClick={handleClose}
                                >
                                    Close
                                </button>
                            </div>
                        )}

                        {step === 'error' && (
                            <div className="vote-error">
                                <h3>
                                    Cannot Verify
                                </h3>

                                <p>
                                    {message}
                                </p>

                                {message
                                    .toLowerCase()
                                    .includes('login') ? (
                                    <button
                                        className="vote-btn-primary"
                                        onClick={goToLogin}
                                    >
                                        Login to Verify
                                    </button>
                                ) : (
                                    <button
                                        className="vote-btn-primary"
                                        onClick={handleClose}
                                    >
                                        Close
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        ),
        document.body
    );
}

export default VerifyReportModal;
