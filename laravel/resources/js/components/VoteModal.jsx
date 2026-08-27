import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken } from '../utils/tokenStorage';

function VoteModal({
    locationId,
    isOpen,
    onClose,
    onVoteSuccess
}) {
    const navigate = useNavigate();

    const [step, setStep] = useState('checking');

    const [loading, setLoading] = useState(false);
    const [checkingLocation, setCheckingLocation] = useState(false);

    const [eligibility, setEligibility] = useState(null);

    const [message, setMessage] = useState('');
    const [gpsStatus, setGpsStatus] = useState('');

    const [detectedLocation, setDetectedLocation] = useState(null);
    const [verifiedLocation, setVerifiedLocation] = useState(null);

    useEffect(() => {
        if (!isOpen || !locationId) {
            return;
        }

        checkEligibility();
    }, [isOpen, locationId]);

    // =====================================================
    // CHECK VOTING ELIGIBILITY
    // =====================================================

    const checkEligibility = async () => {
        setLoading(true);

        setStep('checking');

        setMessage('');
        setGpsStatus('');

        setDetectedLocation(null);
        setVerifiedLocation(null);

        try {
            const token = getToken();

            const response = await fetch(
                `/api/votes/check/${locationId}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/json',
                    },
                }
            );

            const data = await response.json();

            setEligibility(data);

            if (!response.ok || !data.eligible) {
                setStep('error');

                setMessage(
                    data.message ||
                    'You are not eligible to vote.'
                );

                return;
            }

            /*
             * Every vote requires a fresh GPS verification.
             *
             * A previous check-in or saved location
             * cannot be used to bypass this step.
             */
            setStep('checkin');

        } catch (error) {
            console.error(
                'Error checking vote eligibility:',
                error
            );

            setStep('error');

            setMessage(
                'Unable to check voting eligibility.'
            );

        } finally {
            setLoading(false);
        }
    };

    // =====================================================
    // DETECT CURRENT GPS LOCATION
    // =====================================================

    const getCurrentLocation = () => {
        setMessage('');

        setGpsStatus(
            'Getting your current location...'
        );

        setDetectedLocation(null);
        setVerifiedLocation(null);

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

                const currentLocation = {
                    latitude,
                    longitude,
                    accuracy,
                };

                setDetectedLocation(currentLocation);

                setGpsStatus(
                    'Verifying your distance from this hidden gem...'
                );

                await verifyCurrentLocation(
                    latitude,
                    longitude
                );
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
            },

            {
                /*
                 * Request a more accurate location.
                 */
                enableHighAccuracy: true,

                /*
                 * Give the browser up to 15 seconds.
                 */
                timeout: 15000,

                /*
                 * Do not reuse a previously cached GPS location.
                 */
                maximumAge: 0,
            }
        );
    };

    // =====================================================
    // VERIFY CURRENT GPS WITH BACKEND
    // =====================================================

    const verifyCurrentLocation = async (
        latitude,
        longitude
    ) => {
        try {
            const token = getToken();

            const response = await fetch(
                `/api/votes/checkin/${locationId}`,
                {
                    method: 'POST',

                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },

                    body: JSON.stringify({
                        latitude,
                        longitude,
                        check_in_at:
                            new Date().toISOString(),
                    }),
                }
            );

            const data = await response.json();

            // =================================================
            // OUTSIDE 5 KM OR VERIFICATION FAILED
            // =================================================

            if (!response.ok) {
                setVerifiedLocation(null);

                if (
                    data.distance !== undefined &&
                    data.max_distance !== undefined
                ) {
                    setGpsStatus(
                        `error: You are ${data.distance} km away. You must be within ${data.max_distance} km to vote.`
                    );
                } else {
                    setGpsStatus(
                        `error: ${
                            data.message ||
                            'Location verification failed.'
                        }`
                    );
                }

                /*
                 * Stay on the check-in screen.
                 *
                 * Vote buttons will NOT appear.
                 */
                setStep('checkin');

                return;
            }

            // =================================================
            // WITHIN 5 KM
            // =================================================

            const verified = {
                latitude,
                longitude,

                distance:
                    data.distance !== undefined
                        ? data.distance
                        : null,

                verifiedAt:
                    new Date().toISOString(),
            };

            setVerifiedLocation(verified);

            setGpsStatus(
                'success: Current location verified.'
            );

            if (
                data.distance !== undefined &&
                data.distance !== null
            ) {
                setMessage(
                    `You are ${data.distance} km away and within the allowed voting area.`
                );
            } else {
                setMessage(
                    'You are within the allowed voting area.'
                );
            }

            /*
             * Only after successful verification
             * will the Vote buttons appear.
             */
            setStep('ready');

        } catch (error) {
            console.error(
                'Error verifying location:',
                error
            );

            setVerifiedLocation(null);

            setGpsStatus(
                'error: Location verification failed. Please try again.'
            );

            setStep('checkin');

        } finally {
            setCheckingLocation(false);
        }
    };

    // =====================================================
    // SAVE VERIFIED LOCATION
    // =====================================================

    const saveVerifiedLocation = () => {
        if (!verifiedLocation) {
            return;
        }

        const locationData = {
            latitude:
                verifiedLocation.latitude,

            longitude:
                verifiedLocation.longitude,

            saved_at:
                new Date().toISOString(),
        };

        /*
         * Each Hidden Gem has its own saved location.
         *
         * Example:
         * vote_location_12
         * vote_location_35
         *
         * If a saved location already exists,
         * this will replace it.
         */
        localStorage.setItem(
            `vote_location_${locationId}`,
            JSON.stringify(locationData)
        );
    };

    // =====================================================
    // SUBMIT VOTE
    // =====================================================

    const submitVote = async (
        saveLocation = false
    ) => {
        /*
         * Frontend protection.
         *
         * A verified current GPS location
         * must exist before voting.
         */
        if (!verifiedLocation) {
            setStep('checkin');

            setGpsStatus(
                'error: Please verify your current location before voting.'
            );

            return;
        }

        setLoading(true);
        setMessage('');

        try {
            const token = getToken();

            const response = await fetch(
                `/api/votes/${locationId}`,
                {
                    method: 'POST',

                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/json',
                    },
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setStep('error');

                setMessage(
                    data.message ||
                    'Failed to submit vote.'
                );

                return;
            }

            /*
             * IMPORTANT:
             *
             * Location is saved ONLY after:
             *
             * 1. GPS passed the 5 km check
             * 2. Vote submission succeeded
             * 3. User chose "Save Location & Vote"
             */

            if (saveLocation) {
                saveVerifiedLocation();
            }

            setStep('success');

            setMessage(
                data.message ||
                'Vote submitted successfully!'
            );

            if (onVoteSuccess) {
                onVoteSuccess(data);
            }

        } catch (error) {
            console.error(
                'Error submitting vote:',
                error
            );

            setStep('error');

            setMessage(
                'Failed to submit vote.'
            );

        } finally {
            setLoading(false);
        }
    };

    // =====================================================
    // RESET
    // =====================================================

    const reset = () => {
        setStep('checking');

        setLoading(false);
        setCheckingLocation(false);

        setEligibility(null);

        setMessage('');
        setGpsStatus('');

        setDetectedLocation(null);
        setVerifiedLocation(null);
    };

    const handleClose = () => {
        reset();

        onClose();
    };

    const goToLogin = () => {
        handleClose();

        navigate('/login');
    };

    if (!isOpen) {
        return null;
    }

    const gemLocation =
        eligibility?.location;

    // =====================================================
    // UI
    // =====================================================

    return (
        <div
            className="vote-modal-overlay"
            onClick={handleClose}
        >
            <div
                className="vote-modal"
                onClick={(event) =>
                    event.stopPropagation()
                }
            >
                {/* =========================================
                    HEADER
                ========================================= */}

                <div className="vote-modal-header">
                    <div>
                        <h2>
                            Vote for Hidden Gem
                        </h2>

                        <p>
                            Verify that you are currently
                            near this location.
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

                    {/* =====================================
                        CHECKING ELIGIBILITY
                    ===================================== */}

                    {step === 'checking' && (
                        <div className="vote-loading">
                            <div
                                className="vote-loading-spinner"
                            />

                            <p>
                                Checking eligibility...
                            </p>
                        </div>
                    )}

                    {/* =====================================
                        DETECT CURRENT GPS
                    ===================================== */}

                    {step === 'checkin' && (
                        <div className="vote-checkin">

                            <div className="vote-section-heading">
                                <h3>
                                    Verify Current Location
                                </h3>

                                <p>
                                    Your current GPS location
                                    must be within 5 km of this
                                    hidden gem.
                                </p>
                            </div>

                            {/* Hidden Gem Location */}

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

                                        <p className="vote-location-coords">
                                            {gemLocation.latitude}
                                            ,
                                            {' '}
                                            {gemLocation.longitude}
                                        </p>

                                    </div>

                                </div>
                            )}

                            {/* GPS Detect */}

                            <button
                                type="button"
                                className="vote-detect-btn"
                                onClick={getCurrentLocation}
                                disabled={checkingLocation}
                            >
                                <span className="vote-detect-icon">
                                    ◎
                                </span>

                                <span className="vote-detect-text">

                                    <strong>
                                        {checkingLocation
                                            ? 'Detecting Location...'
                                            : 'Detect My Current Location'}
                                    </strong>

                                    <small>
                                        Use GPS to verify your
                                        distance
                                    </small>

                                </span>

                            </button>

                            {/* Detected Coordinates */}

                            {detectedLocation &&
                                !verifiedLocation && (
                                    <div className="vote-detected-location">

                                        Detected:
                                        {' '}

                                        {detectedLocation.latitude.toFixed(6)}
                                        ,
                                        {' '}

                                        {detectedLocation.longitude.toFixed(6)}

                                    </div>
                                )}

                            {/* GPS Status */}

                            {gpsStatus && (
                                <div
                                    className={`vote-gps-status ${
                                        gpsStatus.startsWith(
                                            'error:'
                                        )
                                            ? 'error'
                                            : gpsStatus.startsWith(
                                                'success:'
                                            )
                                                ? 'success'
                                                : 'checking'
                                    }`}
                                >
                                    {gpsStatus.replace(
                                        /^(error:|success:)/,
                                        ''
                                    )}
                                </div>
                            )}

                            {/* Retry */}

                            {gpsStatus.startsWith(
                                'error:'
                            ) && (
                                <button
                                    type="button"
                                    className="vote-retry-btn"
                                    onClick={getCurrentLocation}
                                    disabled={checkingLocation}
                                >
                                    {checkingLocation
                                        ? 'Detecting...'
                                        : 'Try Detect Again'}
                                </button>
                            )}

                            <button
                                type="button"
                                className="vote-cancel-link"
                                onClick={handleClose}
                            >
                                Cancel
                            </button>

                        </div>
                    )}

                    {/* =====================================
                        LOCATION VERIFIED
                    ===================================== */}

                    {step === 'ready' &&
                        verifiedLocation && (
                            <div className="vote-ready">

                                <div className="vote-ready-icon">
                                    ✓
                                </div>

                                <div className="vote-section-heading">

                                    <h3>
                                        Location Verified
                                    </h3>

                                    <p>
                                        You are within 5 km of
                                        this hidden gem and can
                                        now vote.
                                    </p>

                                </div>

                                {/* Verified Information */}

                                <div className="vote-verified-card">

                                    <div>
                                        <span>
                                            Current Location
                                        </span>

                                        <strong>
                                            {verifiedLocation.latitude.toFixed(6)}
                                            ,
                                            {' '}
                                            {verifiedLocation.longitude.toFixed(6)}
                                        </strong>
                                    </div>

                                    {verifiedLocation.distance !==
                                        null && (
                                            <div>

                                                <span>
                                                    Distance
                                                </span>

                                                <strong>
                                                    {verifiedLocation.distance}
                                                    {' '}
                                                    km
                                                </strong>

                                            </div>
                                        )}

                                </div>

                                {message && (
                                    <div className="vote-message success">
                                        {message}
                                    </div>
                                )}

                                {/* =================================
                                    USER CHOICE
                                ================================= */}

                                <div className="vote-choice-list">

                                    {/* Vote Only */}

                                    <button
                                        type="button"
                                        className="vote-choice vote-choice-primary"
                                        onClick={() =>
                                            submitVote(false)
                                        }
                                        disabled={loading}
                                    >
                                        <span>

                                            <strong>
                                                {loading
                                                    ? 'Submitting...'
                                                    : 'Vote Now'}
                                            </strong>

                                            <small>
                                                Submit your vote
                                                without saving
                                                this location
                                            </small>

                                        </span>

                                        <span>
                                            →
                                        </span>
                                    </button>

                                    {/* Save + Vote */}

                                    <button
                                        type="button"
                                        className="vote-choice vote-choice-save"
                                        onClick={() =>
                                            submitVote(true)
                                        }
                                        disabled={loading}
                                    >
                                        <span>

                                            <strong>
                                                Save Location & Vote
                                            </strong>

                                            <small>
                                                Save this verified
                                                location for this
                                                hidden gem
                                            </small>

                                        </span>

                                        <span>
                                            ☆
                                        </span>
                                    </button>

                                </div>

                                {/* Other Actions */}

                                <div className="vote-ready-footer">

                                    <button
                                        type="button"
                                        className="vote-small-btn"
                                        onClick={
                                            getCurrentLocation
                                        }
                                        disabled={
                                            loading ||
                                            checkingLocation
                                        }
                                    >
                                        Detect Again
                                    </button>

                                    <button
                                        type="button"
                                        className="vote-small-btn"
                                        onClick={handleClose}
                                        disabled={loading}
                                    >
                                        Cancel
                                    </button>

                                </div>

                            </div>
                        )}

                    {/* =====================================
                        SUCCESS
                    ===================================== */}

                    {step === 'success' && (
                        <div className="vote-result vote-success">

                            <div className="vote-result-icon success">
                                ✓
                            </div>

                            <h3>
                                Vote Submitted!
                            </h3>

                            <p>
                                {message}
                            </p>

                            <button
                                type="button"
                                className="vote-btn-primary"
                                onClick={handleClose}
                            >
                                Close
                            </button>

                        </div>
                    )}

                    {/* =====================================
                        ERROR
                    ===================================== */}

                    {step === 'error' && (
                        <div className="vote-result vote-error">

                            <div className="vote-result-icon error">
                                !
                            </div>

                            <h3>
                                Cannot Vote
                            </h3>

                            <p>
                                {message}
                            </p>

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
    );
}

export default VoteModal;