import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken } from '../utils/tokenStorage';

function VoteModal({ locationId, isOpen, onClose, onVoteSuccess }) {
    const navigate = useNavigate();
    const [step, setStep] = useState('checking');
    const [loading, setLoading] = useState(false);
    const [eligibility, setEligibility] = useState(null);
    const [comment, setComment] = useState('');
    const [photo, setPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [message, setMessage] = useState('');
    const [checkingIn, setCheckingIn] = useState(false);
    const [gpsStatus, setGpsStatus] = useState('');
    const [userLocation, setUserLocation] = useState(null);
    const [checkInMethod, setCheckInMethod] = useState(null);
    const [manualLat, setManualLat] = useState('');
    const [manualLng, setManualLng] = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (isOpen && locationId) {
            checkEligibility();
        }
    }, [isOpen, locationId]);

    const checkEligibility = async () => {
        setLoading(true);
        setStep('checking');
        try {
            const token = getToken();
            const response = await fetch('/api/votes/check/' + locationId, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Accept': 'application/json'
                }
            });
            const data = await response.json();
            setEligibility(data);
            if (data.eligible) {
                if (data.has_check_in) {
                    setStep('voting');
                } else {
                    setStep('checkin');
                }
            } else {
                setStep('error');
                setMessage(data.message);
            }
        } catch (error) {
            setStep('error');
            setMessage('Unable to check eligibility');
        } finally {
            setLoading(false);
        }
    };

    const getCurrentLocation = () => {
        setGpsStatus('Getting your location...');
        setCheckInMethod('gps');

        if (!navigator.geolocation) {
            setGpsStatus('error: Geolocation is not supported by your browser');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setUserLocation({ latitude, longitude });
                setGpsStatus('success: Location found!');
                performCheckIn(latitude, longitude);
            },
            (error) => {
                let errorMsg = 'Unable to get your location. ';
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMsg += 'Please allow location access in your browser.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMsg += 'Location information is unavailable.';
                        break;
                    case error.TIMEOUT:
                        errorMsg += 'Location request timed out.';
                        break;
                    default:
                        errorMsg += error.message;
                }
                setGpsStatus('error: ' + errorMsg);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    };

    const handleManualCheckIn = () => {
        setCheckInMethod('manual');
        setStep('manual_checkin');
        setMessage('');
        setGpsStatus('');
    };

    const performCheckIn = async (latitude, longitude) => {
        setCheckingIn(true);
        setMessage('');
        try {
            const token = getToken();
            const response = await fetch('/api/votes/checkin/' + locationId, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    latitude: latitude,
                    longitude: longitude,
                    check_in_at: new Date().toISOString()
                })
            });
            const data = await response.json();

            if (response.ok) {
                setEligibility({ ...eligibility, has_check_in: true });
                setStep('voting');
                const distanceMsg = data.distance ? ' (' + data.distance + ' km away)' : '';
                setMessage('Check-in successful!' + distanceMsg);
            } else {
                if (data.distance && data.max_distance) {
                    setMessage('You are ' + data.distance + ' km away. You must be within ' + data.max_distance + ' km to check in.');
                } else {
                    setMessage(data.message || 'Check-in failed');
                }
            }
        } catch (error) {
            setMessage('Check-in failed');
        } finally {
            setCheckingIn(false);
        }
    };

    const confirmManualCheckIn = () => {
        const lat = parseFloat(manualLat);
        const lng = parseFloat(manualLng);

        if (!manualLat || !manualLng) {
            setMessage('Please enter your current latitude and longitude.');
            return;
        }

        if (isNaN(lat) || isNaN(lng)) {
            setMessage('Please enter valid coordinates.');
            return;
        }

        performCheckIn(lat, lng);
    };

    const useCurrentLocationForManual = () => {
        setGpsStatus('Detecting your location...');
        
        if (!navigator.geolocation) {
            setGpsStatus('error: Geolocation is not supported by your browser');
            setMessage('Geolocation is not supported by your browser. Please enter coordinates manually.');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setManualLat(latitude.toString());
                setManualLng(longitude.toString());
                setGpsStatus('success: Location detected!');
                setMessage('Location detected! Click "Confirm Check-in" to proceed.');
            },
            (error) => {
                let errorMsg = 'Unable to get your location. ';
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMsg += 'Please allow location access in your browser.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMsg += 'Location information is unavailable.';
                        break;
                    case error.TIMEOUT:
                        errorMsg += 'Location request timed out.';
                        break;
                    default:
                        errorMsg += error.message;
                }
                setGpsStatus('error: ' + errorMsg);
                setMessage(errorMsg + ' Please enter coordinates manually.');
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
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

    const handleSubmitVote = async () => {
        setLoading(true);
        setMessage('');
        try {
            const token = getToken();
            const formData = new FormData();
            formData.append('comment', comment);
            if (photo) {
                formData.append('photo', photo);
            }

            const response = await fetch('/api/votes/' + locationId, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token
                },
                body: formData
            });

            const data = await response.json();
            if (response.ok) {
                setStep('success');
                setMessage(data.message);
                if (onVoteSuccess) {
                    onVoteSuccess(data);
                }
            } else {
                setMessage(data.message || 'Failed to submit vote');
                setStep('error');
            }
        } catch (error) {
            setMessage('Failed to submit vote');
            setStep('error');
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setStep('checking');
        setComment('');
        setPhoto(null);
        setPhotoPreview(null);
        setMessage('');
        setEligibility(null);
        setUserLocation(null);
        setGpsStatus('');
        setCheckInMethod(null);
        setManualLat('');
        setManualLng('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const goToLogin = () => {
        handleClose();
        navigate('/login');
    };

    const goBackToCheckIn = () => {
        setStep('checkin');
        setGpsStatus('');
        setUserLocation(null);
        setCheckInMethod(null);
        setMessage('');
        setManualLat('');
        setManualLng('');
    };

    if (!isOpen) return null;

    const gemLocation = eligibility?.location;

    return (
        <div className="vote-modal-overlay" onClick={handleClose}>
            <div className="vote-modal" onClick={(e) => e.stopPropagation()}>
                <div className="vote-modal-header">
                    <h2>Vote for Hidden Gem</h2>
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
                            <p>You need to check-in at this location before you can vote.</p>

                            {gemLocation && (
                                <div className="vote-checkin-location">
                                    <p className="vote-checkin-location-name">{gemLocation.place_name}</p>
                                    <p className="vote-checkin-location-address">{gemLocation.address}</p>
                                    <p className="vote-checkin-location-coords">
                                        {gemLocation.latitude}, {gemLocation.longitude}
                                    </p>
                                </div>
                            )}

                            <p className="vote-checkin-hint">
                                You must be within 5 km to check in.
                            </p>

                            <div className="vote-checkin-options">
                                <button
                                    className="vote-checkin-option"
                                    onClick={getCurrentLocation}
                                    disabled={checkingIn}
                                >
                                    <span className="vote-checkin-option-label">Use My Current Location</span>
                                    <span className="vote-checkin-option-desc">Auto-detect your GPS position</span>
                                </button>

                                <button
                                    className="vote-checkin-option"
                                    onClick={handleManualCheckIn}
                                    disabled={checkingIn}
                                >
                                    <span className="vote-checkin-option-label">Enter Current Location</span>
                                    <span className="vote-checkin-option-desc">Manually enter your GPS coordinates</span>
                                </button>
                            </div>

                            {gpsStatus && (
                                <div className={`vote-gps-status ${gpsStatus.startsWith('error:') ? 'error' : 'success'}`}>
                                    {gpsStatus.replace(/^(error:|success:)/, '')}
                                </div>
                            )}

                            {message && (
                                <div className={`vote-message ${message.includes('km') ? 'error' : 'success'}`}>
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

                    {step === 'manual_checkin' && (
                        <div className="vote-manual-checkin">
                            <button
                                className="vote-manual-back"
                                onClick={goBackToCheckIn}
                            >
                                ← Back
                            </button>

                            <h3>Enter Your Current Location</h3>

                            {gemLocation && (
                                <div className="vote-checkin-location">
                                    <p className="vote-checkin-location-name">Destination: {gemLocation.place_name}</p>
                                    <p className="vote-checkin-location-coords">
                                        {gemLocation.latitude}, {gemLocation.longitude}
                                    </p>
                                </div>
                            )}

                            <p className="vote-manual-hint">
                                Enter your current GPS coordinates to check in, or click "Detect My Location".
                            </p>

                            <div className="vote-manual-inputs">
                                <div className="vote-manual-input-group">
                                    <label>Latitude</label>
                                    <input
                                        type="text"
                                        className="vote-manual-input"
                                        placeholder="e.g. 3.2143"
                                        value={manualLat}
                                        onChange={(e) => setManualLat(e.target.value)}
                                    />
                                </div>
                                <div className="vote-manual-input-group">
                                    <label>Longitude</label>
                                    <input
                                        type="text"
                                        className="vote-manual-input"
                                        placeholder="e.g. 101.7281"
                                        value={manualLng}
                                        onChange={(e) => setManualLng(e.target.value)}
                                    />
                                </div>
                            </div>

                            <button
                                className="vote-manual-detect-btn"
                                onClick={useCurrentLocationForManual}
                            >
                                Detect My Location
                            </button>

                            {gpsStatus && (
                                <div className={`vote-gps-status ${gpsStatus.startsWith('error:') ? 'error' : 'success'}`}>
                                    {gpsStatus.replace(/^(error:|success:)/, '')}
                                </div>
                            )}

                            {message && (
                                <div className={`vote-message ${message.includes('km') ? 'error' : 'success'}`}>
                                    {message}
                                </div>
                            )}

                            <div className="vote-actions">
                                <button
                                    className="vote-btn-primary"
                                    onClick={confirmManualCheckIn}
                                    disabled={checkingIn}
                                >
                                    {checkingIn ? 'Checking in...' : 'Confirm Check-in'}
                                </button>
                                <button
                                    className="vote-btn-secondary"
                                    onClick={goBackToCheckIn}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'voting' && (
                        <div className="vote-form">
                            <div className="vote-location-info">
                                <p>{eligibility?.location?.place_name}</p>
                                <p className="vote-location-address">{eligibility?.location?.address}</p>
                            </div>

                            <div className="vote-form-group">
                                <label>Your Review</label>
                                <textarea
                                    className="vote-textarea"
                                    placeholder="Share your experience at this hidden gem..."
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    maxLength={1000}
                                />
                                <span className="vote-char-count">{comment.length}/1000</span>
                            </div>

                            <div className="vote-form-group">
                                <label>Upload Photo (optional)</label>
                                <div className="vote-upload-area" onClick={() => fileInputRef.current?.click()}>
                                    {photoPreview ? (
                                        <img src={photoPreview} alt="Preview" className="vote-photo-preview" />
                                    ) : (
                                        <div className="vote-upload-placeholder">
                                            <p>Click to upload a photo</p>
                                        </div>
                                    )}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handlePhotoChange}
                                        style={{ display: 'none' }}
                                    />
                                </div>
                                {photo && (
                                    <button
                                        className="vote-remove-photo"
                                        onClick={() => {
                                            setPhoto(null);
                                            setPhotoPreview(null);
                                            if (fileInputRef.current) {
                                                fileInputRef.current.value = '';
                                            }
                                        }}
                                    >
                                        Remove photo
                                    </button>
                                )}
                            </div>

                            {message && (
                                <div className="vote-message success">{message}</div>
                            )}

                            <div className="vote-actions">
                                <button
                                    className="vote-btn-primary"
                                    onClick={handleSubmitVote}
                                    disabled={loading}
                                >
                                    {loading ? 'Submitting...' : 'Submit Vote'}
                                </button>
                                <button
                                    className="vote-btn-secondary"
                                    onClick={handleClose}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="vote-success">
                            <h3>Vote Submitted!</h3>
                            <p>{message}</p>
                            <button className="vote-btn-primary" onClick={handleClose}>
                                Close
                            </button>
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="vote-error">
                            <h3>Cannot Vote</h3>
                            <p>{message}</p>
                            {message.includes('login') ? (
                                <button className="vote-btn-primary" onClick={goToLogin}>
                                    Login to Vote
                                </button>
                            ) : (
                                <button className="vote-btn-primary" onClick={handleClose}>
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