import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
    const [authenticatedUserId, setAuthenticatedUserId] = useState(null);

    const [message, setMessage] = useState('');
    const [gpsStatus, setGpsStatus] = useState('');

    const [detectedLocation, setDetectedLocation] = useState(null);
    const [verifiedLocation, setVerifiedLocation] = useState(null);
    const [savedLocation, setSavedLocation] = useState(null);

    useEffect(() => {
        if (!isOpen || !locationId) {
            return;
        }

        checkEligibility();
    }, [isOpen, locationId]);

    const getStorageKey = (userId) => {
        if (!userId || !locationId) {
            return null;
        }

        return `vote_location_${userId}_${locationId}`;
    };

    const loadSavedLocation = (userId) => {
        const storageKey = getStorageKey(userId);

        if (!storageKey) {
            setSavedLocation(null);
            return null;
        }

        try {
            const raw = localStorage.getItem(storageKey);

            if (!raw) {
                setSavedLocation(null);
                return null;
            }

            const parsed = JSON.parse(raw);

            const isValid =
                Number(parsed.user_id) === Number(userId) &&
                Number(parsed.location_id) === Number(locationId) &&
                Number.isFinite(Number(parsed.latitude)) &&
                Number.isFinite(Number(parsed.longitude));

            if (!isValid) {
                localStorage.removeItem(storageKey);
                setSavedLocation(null);
                return null;
            }

            const normalized = {
                user_id: Number(parsed.user_id),
                location_id: Number(parsed.location_id),
                latitude: Number(parsed.latitude),
                longitude: Number(parsed.longitude),
                distance:
                    parsed.distance !== null &&
                    parsed.distance !== undefined
                        ? Number(parsed.distance)
                        : null,
                verified_at: parsed.verified_at || null,
                saved_at: parsed.saved_at || null,
            };

            setSavedLocation(normalized);

            return normalized;

        } catch (error) {
            console.error(
                'Error loading saved location:',
                error
            );

            localStorage.removeItem(storageKey);
            setSavedLocation(null);

            return null;
        }
    };

    const checkEligibility = async () => {
        setLoading(true);
        setStep('checking');

        setMessage('');
        setGpsStatus('');

        setDetectedLocation(null);
        setVerifiedLocation(null);
        setSavedLocation(null);
        setAuthenticatedUserId(null);

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

            if (!data.user_id) {
                setStep('error');

                setMessage(
                    'Unable to identify the current user.'
                );

                return;
            }

            setAuthenticatedUserId(data.user_id);

            const saved = loadSavedLocation(
                data.user_id
            );

            if (saved) {
                setStep('saved');
            } else {
                setStep('checkin');
            }

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
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0,
            }
        );
    };

    const verifyLocationWithBackend = async (
        latitude,
        longitude
    ) => {
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

        return {
            response,
            data,
        };
    };

    const verifyCurrentLocation = async (
        latitude,
        longitude
    ) => {
        try {
            const {
                response,
                data,
            } = await verifyLocationWithBackend(
                latitude,
                longitude
            );

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

                setStep('checkin');

                return;
            }

            const verified = {
                latitude: Number(latitude),
                longitude: Number(longitude),
                distance:
                    data.distance !== undefined
                        ? Number(data.distance)
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

    const saveVerifiedLocation = () => {
        if (
            !verifiedLocation ||
            !authenticatedUserId
        ) {
            setStep('checkin');

            setGpsStatus(
                'error: Please verify your current location before saving it.'
            );

            return;
        }

        const storageKey =
            getStorageKey(authenticatedUserId);

        if (!storageKey) {
            setStep('error');

            setMessage(
                'Unable to save this location.'
            );

            return;
        }

        const locationData = {
            user_id:
                Number(authenticatedUserId),

            location_id:
                Number(locationId),

            latitude:
                Number(verifiedLocation.latitude),

            longitude:
                Number(verifiedLocation.longitude),

            distance:
                verifiedLocation.distance,

            verified_at:
                verifiedLocation.verifiedAt,

            saved_at:
                new Date().toISOString(),
        };

        try {
            localStorage.setItem(
                storageKey,
                JSON.stringify(locationData)
            );

            setSavedLocation(locationData);

            setMessage(
                'Location saved successfully. You can return later and vote using this saved location.'
            );

            setStep('saved_success');

        } catch (error) {
            console.error(
                'Error saving location:',
                error
            );

            setStep('error');

            setMessage(
                'Unable to save this location.'
            );
        }
    };

    const removeSavedLocation = () => {
        if (!authenticatedUserId) {
            return;
        }

        const storageKey =
            getStorageKey(authenticatedUserId);

        if (storageKey) {
            localStorage.removeItem(storageKey);
        }

        setSavedLocation(null);
        setMessage('');
        setGpsStatus('');
        setStep('checkin');
    };

    const clearSavedLocationAfterVote = () => {
        if (!authenticatedUserId) {
            return;
        }

        const storageKey =
            getStorageKey(authenticatedUserId);

        if (storageKey) {
            localStorage.removeItem(storageKey);
        }

        setSavedLocation(null);
    };

    const submitVoteRequest = async () => {
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
            throw new Error(
                data.message ||
                'Failed to submit vote.'
            );
        }

        clearSavedLocationAfterVote();

        setStep('success');

        setMessage(
            data.message ||
            'Vote submitted successfully!'
        );

        if (onVoteSuccess) {
            onVoteSuccess(data);
        }
    };

    const submitVoteNow = async () => {
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
            await submitVoteRequest();

        } catch (error) {
            console.error(
                'Error submitting vote:',
                error
            );

            setStep('error');

            setMessage(
                error.message ||
                'Failed to submit vote.'
            );

        } finally {
            setLoading(false);
        }
    };

    const voteUsingSavedLocation = async () => {
        if (!savedLocation) {
            setStep('checkin');

            setMessage('');
            setGpsStatus('');

            return;
        }

        if (
            Number(savedLocation.user_id) !==
                Number(authenticatedUserId) ||
            Number(savedLocation.location_id) !==
                Number(locationId)
        ) {
            removeSavedLocation();

            setGpsStatus(
                'error: This saved location does not belong to the current user or hidden gem.'
            );

            return;
        }

        setLoading(true);
        setMessage('');
        setGpsStatus('');

        try {
            const {
                response,
                data,
            } = await verifyLocationWithBackend(
                savedLocation.latitude,
                savedLocation.longitude
            );

            if (!response.ok) {
                setStep('checkin');

                if (
                    data.distance !== undefined &&
                    data.max_distance !== undefined
                ) {
                    setGpsStatus(
                        `error: The saved location is ${data.distance} km away from this hidden gem. Please verify your current location again.`
                    );
                } else {
                    setGpsStatus(
                        `error: ${
                            data.message ||
                            'The saved location can no longer be used.'
                        }`
                    );
                }

                return;
            }

            await submitVoteRequest();

        } catch (error) {
            console.error(
                'Error voting with saved location:',
                error
            );

            setStep('error');

            setMessage(
                error.message ||
                'Failed to submit vote using the saved location.'
            );

        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setStep('checking');

        setLoading(false);
        setCheckingLocation(false);

        setEligibility(null);
        setAuthenticatedUserId(null);

        setMessage('');
        setGpsStatus('');

        setDetectedLocation(null);
        setVerifiedLocation(null);
        setSavedLocation(null);
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
                        <h2>
                            Vote for Hidden Gem
                        </h2>

                        <p>
                            Verify your current location or use
                            your saved verified location.
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
                            <div
                                className="vote-loading-spinner"
                            />

                            <p>
                                Checking eligibility...
                            </p>
                        </div>
                    )}

                    {step === 'saved' &&
                        savedLocation && (
                            <div className="vote-ready">

                                <div className="vote-ready-icon">
                                    📍
                                </div>

                                <div className="vote-section-heading">
                                    <h3>
                                        Saved Location Available
                                    </h3>

                                    <p>
                                        You previously verified and
                                        saved a location for this
                                        hidden gem.
                                    </p>
                                </div>

                                <div className="vote-verified-card">

                                    <div>
                                        <span>
                                            Saved Location
                                        </span>

                                        <strong>
                                            {savedLocation.latitude.toFixed(6)}
                                            ,
                                            {' '}
                                            {savedLocation.longitude.toFixed(6)}
                                        </strong>
                                    </div>

                                    {savedLocation.distance !==
                                        null && (
                                            <div>
                                                <span>
                                                    Verified Distance
                                                </span>

                                                <strong>
                                                    {savedLocation.distance}
                                                    {' '}
                                                    km
                                                </strong>
                                            </div>
                                        )}

                                    {savedLocation.saved_at && (
                                        <div>
                                            <span>
                                                Saved On
                                            </span>

                                            <strong>
                                                {new Date(
                                                    savedLocation.saved_at
                                                ).toLocaleString()}
                                            </strong>
                                        </div>
                                    )}

                                </div>

                                <div className="vote-choice-list">

                                    <button
                                        type="button"
                                        className="vote-choice vote-choice-primary"
                                        onClick={
                                            voteUsingSavedLocation
                                        }
                                        disabled={loading}
                                    >
                                        <span>

                                            <strong>
                                                {loading
                                                    ? 'Submitting...'
                                                    : 'Vote Using Saved Location'}
                                            </strong>

                                            <small>
                                                Use this saved verified
                                                location to vote now
                                            </small>

                                        </span>

                                        <span>
                                            →
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        className="vote-choice vote-choice-save"
                                        onClick={() => {
                                            setStep('checkin');
                                            setMessage('');
                                            setGpsStatus('');
                                        }}
                                        disabled={loading}
                                    >
                                        <span>

                                            <strong>
                                                Verify New Location
                                            </strong>

                                            <small>
                                                Detect and verify your
                                                current GPS location
                                            </small>

                                        </span>

                                        <span>
                                            ◎
                                        </span>
                                    </button>

                                </div>

                                <div className="vote-ready-footer">

                                    <button
                                        type="button"
                                        className="vote-small-btn"
                                        onClick={
                                            removeSavedLocation
                                        }
                                        disabled={loading}
                                    >
                                        Remove Saved Location
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
                                        this hidden gem.
                                    </p>

                                </div>

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

                                <div className="vote-choice-list">

                                    <button
                                        type="button"
                                        className="vote-choice vote-choice-primary"
                                        onClick={submitVoteNow}
                                        disabled={loading}
                                    >
                                        <span>

                                            <strong>
                                                {loading
                                                    ? 'Submitting...'
                                                    : 'Vote Now'}
                                            </strong>

                                            <small>
                                                Submit your vote now
                                                without saving this
                                                location
                                            </small>

                                        </span>

                                        <span>
                                            →
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        className="vote-choice vote-choice-save"
                                        onClick={
                                            saveVerifiedLocation
                                        }
                                        disabled={loading}
                                    >
                                        <span>

                                            <strong>
                                                Save Location for Later
                                            </strong>

                                            <small>
                                                Save this verified
                                                location without
                                                voting now
                                            </small>

                                        </span>

                                        <span>
                                            ☆
                                        </span>
                                    </button>

                                </div>

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

                    {step === 'saved_success' && (
                        <div className="vote-result vote-success">

                            <div className="vote-result-icon success">
                                ✓
                            </div>

                            <h3>
                                Location Saved
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
    ), document.body);
}

export default VoteModal;
