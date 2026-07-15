import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
    getTripItineraries,
    createTripItinerary,
    updateTripItinerary,
    deleteTripItinerary
} from "../api/TripItinerary";

import "../styles/global.css";

export default function TripItinerary() {

    const [tripName, setTripName] = useState("");
    const [tripItineraries, setTripItineraries] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState("");
    const [showCreateModal, setShowCreateModal] = useState(false);
    const navigate = useNavigate();

    const loadTripItineraries = () => {
        getTripItineraries()
            .then(res => {
                setTripItineraries(res.data);
            })
            .catch(err => {
                console.log(err);
            });
    };

    useEffect(() => {
        loadTripItineraries();
    }, []);

    const handleCreate = () => {

        if (!tripName.trim()) return;

        createTripItinerary({
            name: tripName
        })
            .then((res) => {

                setTripName("");

                const newTrip = res.data.data;

                setTripItineraries(prev => [
                    newTrip,
                    ...prev
                ]);

            })
            .catch(console.error);

    };

    const handleUpdate = (id) => {

        updateTripItinerary(id, {
            name: editingName
        })
            .then(() => {
                setEditingId(null);
                loadTripItineraries();
            });

    };

    const handleDelete = (id) => {

        if (!window.confirm("Delete this itinerary?"))
            return;

        deleteTripItinerary(id)
            .then(() => {

                setTripItineraries(prev =>
                    prev.filter(trip => trip.id !== id)
                );

            });

    };

    return (
        <div className="trip-page">

            <div className="trip-header">

                <h1>
                    My Trip Itineraries
                </h1>

                <button
                    className="create-btn"
                    onClick={() => setShowCreateModal(true)}
                >
                    + Create Itinerary
                </button>

            </div>


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
                            {trip.name}
                        </h2>

                        <p>
                            Created:
                            {" "}
                            {new Date(trip.created_at)
                                .toLocaleDateString()}
                        </p>

                    </div>

                ))}

            </div>



            {
                showCreateModal && (

                    <div className="modal-overlay">

                        <div className="modal">


                            <h2>
                                Create New Itinerary
                            </h2>


                            <input
                                placeholder="Enter trip name"
                                value={tripName}
                                onChange={(e) =>
                                    setTripName(e.target.value)
                                }
                            />


                            <div>

                                <button
                                    onClick={() =>
                                        setShowCreateModal(false)
                                    }
                                >
                                    Cancel
                                </button>


                                <button
                                    onClick={() => {
                                        handleCreate();
                                        setShowCreateModal(false);
                                    }}
                                >
                                    Create
                                </button>

                            </div>


                        </div>

                    </div>

                )
            }


        </div>
    );
}