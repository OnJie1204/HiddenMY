import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
    getTripItineraries,
    createTripItinerary
} from "@/features/travel/tripItinerariesApi";

import "@css/base/global.css";

export default function TripItinerary() {

    const [tripName, setTripName] = useState("");
    const [nameError, setNameError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (tripName.trim().length > 10) {
            setNameError("Trip name cannot exceed 10 characters.");
            return;
        }

        setNameError("");

        try {
            const newTrip = await handleCreate();

            // Only dismiss the dialog once the itinerary is actually saved —
            // otherwise a failed create looks exactly like a successful one.
            setShowCreateModal(false);
            setTripName("");

            // Drop the user straight into the itinerary they just created, and
            // carry the success notice over so the detail page can show it.
            if (newTrip?.id) {
                navigate(`/trip-itinerary/${newTrip.id}`, {
                    state: {
                        itinerary: newTrip,
                        notice: "Trip itinerary created successfully.",
                    },
                });
            }
        } catch (err) {
            console.error(err);
            setNameError(
                err?.response?.data?.message
                || "Unable to create the itinerary. Please try again."
            );
        }
    };

    const [tripItineraries, setTripItineraries] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [isLoadingItineraries, setIsLoadingItineraries] = useState(true);
    const navigate = useNavigate();

    const loadTripItineraries = () => {
        setIsLoadingItineraries(true);
        getTripItineraries()
            .then(res => {
                setTripItineraries(res.data);
            })
            .catch(err => {
                console.log(err);
            })
            .finally(() => {
                setIsLoadingItineraries(false);
            });
    };

    useEffect(() => {
        loadTripItineraries();
    }, []);

    useEffect(() => {
        if (!successMessage) return;

        const timer = setTimeout(() => setSuccessMessage(""), 3000);

        return () => clearTimeout(timer);
    }, [successMessage]);

    const handleCreate = async () => {

        if (!tripName.trim()) return;

        setIsCreating(true);

        try {
            const res = await createTripItinerary({
                trip_name: tripName
            });

            const newTrip = res.data.data;

            setTripItineraries(prev => [
                newTrip,
                ...prev
            ]);

            setSuccessMessage(res.data.message || "Trip itinerary created successfully.");

            return newTrip;
        } finally {
            setIsCreating(false);
        }

    };

    const closeCreateModal = () => {
        if (isCreating) return;

        setShowCreateModal(false);
        setTripName("");
        setNameError("");
    };

    return (
        <div className="trip-page">

            {successMessage && (
                <div className="hidden-gem-snackbar hidden-gem-snackbar-success" role="status">
                    {successMessage}
                </div>
            )}

            <div className="trip-header">

                <h1>
                    My Trip Itineraries
                </h1>

                <button
                    className="trip-itinerary-create-btn"
                    onClick={() => setShowCreateModal(true)}
                >
                    + Create Itinerary
                </button>

            </div>


            {isLoadingItineraries ? (

                <div
                    className="page-loading-bar"
                    role="progressbar"
                    aria-label="Loading itineraries"
                >
                    <div className="page-loading-bar-indicator" />
                </div>

            ) : tripItineraries.length === 0 ? (

                <div className="hidden-gems-empty">
                    <p>You haven't created any trip itineraries yet.</p>
                </div>

            ) : (

                <div className="trip-list">

                    {tripItineraries.map((trip) => (

                        <div
                            className="trip-card"
                            key={trip.id}
                            onClick={() => navigate(`/trip-itinerary/${trip.id}`, {
                                state: {
                                    itinerary: trip
                                }
                            })}
                        >

                            <h2>
                                {trip.trip_name}
                            </h2>

                            <p className="trip-itinerary-stop-count">
                                {trip.locations_count ?? 0} Stops
                            </p>

                            <div className="trip-itinerary-card-dates">

                                <p className="trip-itinerary-created-date">
                                    Created:
                                    {" "}
                                    {new Date(trip.created_at).toLocaleDateString(
                                        "en-GB",
                                        {
                                            day: "numeric",
                                            month: "short",
                                            year: "numeric"
                                        }
                                    )}
                                </p>

                                {trip.created_at !== trip.updated_at && (

                                    <p className="trip-itinerary-modified-date">
                                        Last Modified:
                                        {" "}
                                        {new Date(trip.updated_at).toLocaleDateString(
                                            "en-GB",
                                            {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric"
                                            }
                                        )}
                                    </p>

                                )}

                            </div>

                        </div>

                    ))}

                </div>

            )}



            {
                showCreateModal && (

                    <div
                        className="modal-overlay"
                        onClick={closeCreateModal}
                    >

                        <div className="modal" onClick={(e) => e.stopPropagation()}>

                            <div className="modal-header">
                                <h2>
                                    Create New Itinerary
                                </h2>

                                <button
                                    type="button"
                                    className="modal-close-btn"
                                    onClick={closeCreateModal}
                                    disabled={isCreating}
                                    aria-label="Close"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="modal-body">
                                <form onSubmit={handleSubmit} noValidate>
                                    <input
                                        placeholder="Enter trip name"
                                        value={tripName}
                                        onChange={(e) => {
                                            setTripName(e.target.value);
                                            if (nameError) setNameError("");
                                        }}
                                        className={nameError ? "trip-input-error" : ""}
                                        aria-invalid={nameError ? "true" : "false"}
                                        aria-describedby={nameError ? "trip-name-error" : undefined}
                                        autoFocus
                                    />

                                    {nameError && (
                                        <p id="trip-name-error" className="trip-name-error" role="alert">
                                            {nameError}
                                        </p>
                                    )}

                                    <div className="trip-create-modal-actions">

                                        <button
                                            type="button"
                                            className="trip-create-modal-cancel-btn"
                                            onClick={closeCreateModal}
                                            disabled={isCreating}
                                        >
                                            Cancel
                                        </button>

                                        <button
                                            type="submit"
                                            className="trip-create-modal-confirm-btn"
                                            disabled={!tripName.trim() || isCreating}
                                        >
                                            {isCreating ? "Creating…" : "Create Itinerary"}
                                        </button>

                                    </div>
                                </form>
                            </div>

                        </div>

                    </div>

                )
            }


        </div>
    );
}