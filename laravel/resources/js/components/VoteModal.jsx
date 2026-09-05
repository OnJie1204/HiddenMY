import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { loginNavOptions } from '../utils/authRedirect';
import { checkVoteEligibility, submitVote } from '../features/community/votesApi';

function VoteModal({
    locationId,
    isOpen,
    onClose,
    onVoteSuccess,
}) {
    const navigate = useNavigate();
    const location = useLocation();

    const [step, setStep] = useState('checking');
    const [loading, setLoading] = useState(false);
    const [checkingLocation, setCheckingLocation] = useState(false);
    const [eligibility, setEligibility] = useState(null);
    const [message, setMessage] = useState('');
    const [gpsStatus, setGpsStatus] = useState('');
    const [detectedLocation, setDetectedLocation] = useState(null);

    useEffect(() => {
        if (!isOpen || !locationId) {
            return;
        }

        checkEligibility();
    }, [isOpen, locationId]);

    const checkEligibility = async () => {
        setLoading(true);
        setStep('checking');
        setMessage('');
        setGpsStatus('');
        setDetectedLocation(null);

        try {
            const response = await checkVoteEligibility(locationId);
            const data = response.data;
            setEligibility(data);

            if (!data.eligible) {
                setStep('error');
                setMessage(
                    data.message ||
                    'You are not eligible to vote.'
                );
                return;
            }

            setStep('detect');
        } catch (error) {
            console.error(
                'Error checking vote eligibility:',
                error
            );

            setStep('error');
            setMessage(error.response?.data?.message || 'Unable to check voting eligibility.');
        } finally {
            setLoading(false);
        }
    };

    const submitVoteWithLocation = async (
        latitude,
        longitude
    ) => {
        const response = await submitVote(locationId, { latitude, longitude });

        return response.data;
    };

    const getCurrentLocationAndVote = () => {
        setMessage('');
        setGpsStatus(
            'Getting your current location...'
        );
        setDetectedLocation(null);

        if (!navigator.geolocation) {
            setGpsStatus(
                'error: Geolocation is not supported by your browser.'
            );
            return;
        }

        setCheckingLocation(true);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const {
                    latitude,
                    longitude,
                    accuracy,
                } = position.coords;

                setDetectedLocation({
                    latitude,
                    longitude,
                    accuracy,
                });

                setGpsStatus(
                    'Verifying your location and submitting your vote...'
                );

                try {
                    const data = await submitVoteWithLocation(
                        latitude,
                        longitude
                    );

                    setGpsStatus('');
                    setMessage(
                        data.message ||
                        'Vote submitted successfully!'
                    );
                    setStep('success');

                    if (onVoteSuccess) {
                        onVoteSuccess(data);
                    }
                } catch (error) {
                    console.error(
                        'Error verifying location or submitting vote:',
                        error
                    );

                    const data = error.response?.data || error.data || {};
                    const status = error.response?.status || error.status;

                    if (
                        data.distance !== undefined &&
                        data.max_distance !== undefined
                    ) {
                        setGpsStatus(
                            `error: You are ${data.distance} km away. You must be within ${data.max_distance} km to vote.`
                        );
                        setStep('detect');
                    } else if (
                        status === 401 ||
                        status === 403 ||
                        status === 409 ||
                        status === 400
                    ) {
                        setGpsStatus('');
                        setMessage(
                            data.message ||
                            'You cannot vote for this hidden gem.'
                        );
                        setStep('error');
                    } else {
                        setGpsStatus(
                            `error: ${
                                data.message ||
                                'Unable to verify your location or submit your vote.'
                            }`
                        );
                        setStep('detect');
                    }
                } finally {
                    setCheckingLocation(false);
                }
            },
            (error) => {
                let errorMessage =
                    'Unable to detect your location. ';

                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage +=
                            'Please allow location access in your browser and try again.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage +=
                            'Location information is unavailable. Please try again.';
                        break;
                    case error.TIMEOUT:
                        errorMessage +=
                            'Location detection timed out. Please try again.';
                        break;
                    default:
                        errorMessage +=
                            error.message ||
                            'Please try again.';
                }

                setGpsStatus(
                    `error: ${errorMessage}`
                );
                setCheckingLocation(false);
                setStep('detect');
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0,
            }
        );
    };

    const reset = () => {
        setStep('checking');
        setLoading(false);
        setCheckingLocation(false);
        setEligibility(null);
        setMessage('');
        setGpsStatus('');
        setDetectedLocation(null);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const goToLogin = () => {
        handleClose();
        navigate('/login', loginNavOptions(location));
    };

    if (!isOpen) {
        return null;
    }

    const gemLocation = eligibility?.location;

    return createPortal((
        <div
            className="vote-modal-overlay"
            onClick={(event) => {
                event.stopPropagation();
                handleClose();
            }}
        >
            <div
                className="vote-modal"
                onClick={(event) =>
                    event.stopPropagation()
                }
            >
                <div className="vote-modal-header">
                    <div>
                        <h2>Vote for Hidden Gem</h2>
                        <p>
                            Detect your current location to verify that you are within 5 km and submit your vote.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="vote-modal-close"
                        onClick={handleClose}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                <div className="vote-modal-body">
                    {step === 'checking' && (
                        <div className="vote-loading">
                            <div className="vote-loading-spinner" />
                            <p>Checking eligibility...</p>
                        </div>
                    )}

                    {step === 'detect' && (
                        <div className="vote-checkin">
                            <div className="vote-section-heading">
                                <h3>Verify Current Location</h3>
                                <p>
                                    Your current GPS location must be within 5 km of this hidden gem.
                                </p>
                            </div>

                            {gemLocation && (
                                <div className="vote-location-card">
                                    <div className="vote-location-icon">
                                        📍
                                    </div>

                                    <div className="vote-location-content">
                                        <p className="vote-location-name">
                                            {gemLocation.place_name}
                                        </p>

                                        <p className="vote-location-address">
                                            {gemLocation.address}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <button
                                type="button"
                                className="vote-detect-btn"
                                onClick={getCurrentLocationAndVote}
                                disabled={checkingLocation || loading}
                            >
                                <span className="vote-detect-icon">
                                    ◎
                                </span>

                                <span className="vote-detect-text">
                                    <strong>
                                        {checkingLocation
                                            ? 'Detecting and Voting...'
                                            : gpsStatus.startsWith('error:')
                                                ? 'Try Detect Again'
                                                : 'Detect My Current Location & Vote'}
                                    </strong>

                                    <small>
                                        GPS location is verified by the server before your vote is accepted
                                    </small>
                                </span>
                            </button>

                            {detectedLocation && (
                                <div className="vote-detected-location">
                                    Detected:{' '}
                                    {detectedLocation.latitude.toFixed(6)}, {' '}
                                    {detectedLocation.longitude.toFixed(6)}
                                </div>
                            )}

                            {gpsStatus && (
                                <div
                                    className={`vote-gps-status ${
                                        gpsStatus.startsWith('error:')
                                            ? 'error'
                                            : 'checking'
                                    }`}
                                >
                                    {gpsStatus.replace(
                                        /^error:/,
                                        ''
                                    )}
                                </div>
                            )}

                            <button
                                type="button"
                                className="vote-cancel-link"
                                onClick={handleClose}
                                disabled={checkingLocation}
                            >
                                Cancel
                            </button>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="vote-result vote-success">
                            <div className="vote-result-icon success">
                                ✓
                            </div>

                            <h3>Vote Submitted!</h3>
                            <p>{message}</p>

                            <button
                                type="button"
                                className="vote-btn-primary"
                                onClick={handleClose}
                            >
                                Close
                            </button>
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="vote-result vote-error">
                            <div className="vote-result-icon error">
                                !
                            </div>

                            <h3>Cannot Vote</h3>
                            <p>{message}</p>

                            {message
                                .toLowerCase()
                                .includes('login') ? (
                                <button
                                    type="button"
                                    className="vote-btn-primary"
                                    onClick={goToLogin}
                                >
                                    Login to Vote
                                </button>
                            ) : (
                                <button
                                    type="button"
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
    ), document.body);
}

export default VoteModal;
