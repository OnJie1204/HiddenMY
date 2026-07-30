import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { updateTripItinerary, deleteTripItinerary } from "../api/TripItinerary";

import {
    DndContext,
    closestCenter
} from "@dnd-kit/core";

import {
    SortableContext,
    arrayMove,
    verticalListSortingStrategy,
    useSortable
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

import { MdDragIndicator } from "react-icons/md";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";


import "../styles/global.css";

/* dragable location card component */
function SortableLocationCard({

    location,

    index,

    onDelete

}) {

    const {

        attributes,

        listeners,

        setNodeRef,

        transform,

        transition

    } = useSortable({

        id: location.id

    });

    const style = {

        transform: CSS.Transform.toString(transform),

        transition

    };

    return (

        <div

            ref={setNodeRef}

            style={style}

            className="trip-detail-location-card"

        >

            <div

                className="trip-detail-drag-handle"

                {...attributes}

                {...listeners}

            >

                <MdDragIndicator size={22} />

            </div>

            <div className="trip-detail-location-icon">

                {location.type === "hidden"

                    ? "💎"

                    : "📍"}

            </div>

            <div className="trip-detail-location-name">
                {index + 1}. {location.name}
            </div>

            <button

                className="trip-detail-delete-stop-btn"

                onClick={() => onDelete(location.id)}

            >

                🗑

            </button>

        </div>

    );

}




export default function TripItineraryDetail() {
    const navigate = useNavigate();

    const { id } = useParams();

    const { state } = useLocation();

    const [trip, setTrip] = useState(
        state?.itinerary || null
    );

    const [isRenaming, setIsRenaming] = useState(false);
    const [renameName, setRenameName] = useState("");
    const [isStoppingPointDialogOpen, setIsStoppingPointDialogOpen] = useState(false);

    const closeStoppingPointDialog = () => {
        setIsStoppingPointDialogOpen(false);
    };

    useEffect(() => {
        if (trip) {
            setRenameName(trip.trip_name);
        }
    }, [trip]);

    const createdDate = trip?.created_at
        ? new Date(trip.created_at).toLocaleDateString(
            "en-GB",
            {
                day: "numeric",
                month: "long",
                year: "numeric"
            }
        )
        : "";

    const [locations, setLocations] = useState([
        {
            id: 1,
            name: "Tokyo Tower",
            type: "tourist"
        },
        {
            id: 2,
            name: "Hidden Cafe",
            type: "hidden"
        },
        {
            id: 3,
            name: "Shibuya Crossing",
            type: "tourist"
        }
    ]);

    const handleDragEnd = (event) => {

        const {

            active,

            over

        } = event;

        if (!over) return;

        if (active.id !== over.id) {

            setLocations((items) => {

                const oldIndex = items.findIndex(

                    item => item.id === active.id

                );

                const newIndex = items.findIndex(

                    item => item.id === over.id

                );

                return arrayMove(

                    items,

                    oldIndex,

                    newIndex

                );

            });

        }

    };



    const handleRename = async (e) => {
        e.preventDefault();

        const newName = renameName.trim();

        if (!newName) {
            alert("Trip name is required.");
            return;
        }

        if (newName.length < 1) {
            alert("Trip name must be at least 1 character.");
            return;
        }

        if (newName.length > 10) {
            alert("Trip name cannot exceed 10 characters.");
            return;
        }

        try {
            await updateTripItinerary(id, {
                trip_name: newName
            });

            setTrip({
                ...trip,
                trip_name: newName
            });

            setIsRenaming(false);
        } catch (err) {
            console.error(err);
            alert("Failed to rename itinerary.");
        }
    };



    const handleDelete = async () => {

        if (!window.confirm("Delete this itinerary?")) return;

        try {

            await deleteTripItinerary(id);

            navigate("/trip-itinerary");

        } catch (err) {

            console.error(err);

        }

    };



    const removeLocation = (locationId) => {

        setLocations(
            locations.filter(
                item => item.id !== locationId
            )
        );

    };



    return (

        <div className="trip-detail-container">


            <button
                className="trip-detail-back-btn"
                onClick={() => navigate("/trip-itinerary")}
            >
                ← Back to My Itineraries
            </button>



            <div className="trip-detail-header">


                <div>

                    {isRenaming ? (

                        <form onSubmit={handleRename}>

                            <input
                                type="text"
                                value={renameName}
                                onChange={(e) => setRenameName(e.target.value)}
                                placeholder="Enter itinerary name"
                                autoFocus
                                className="trip-rename-input"
                            />

                            <div className="trip-rename-buttons">

                                <button
                                    type="submit"
                                    className="trip-detail-btn trip-detail-add-btn"
                                >
                                    Rename
                                </button>

                                <button
                                    type="button"
                                    className="trip-detail-btn trip-detail-cancel-btn"
                                    onClick={() => {
                                        setRenameName(trip.trip_name);
                                        setIsRenaming(false);
                                    }}
                                >
                                    Cancel
                                </button>

                            </div>

                        </form>

                    ) : (

                        <>
                            <h1>{trip?.trip_name}</h1>

                            <p className="trip-detail-created-date">
                                Created on {createdDate}
                            </p>
                        </>

                    )}

                </div>



                <div>

                    {!isRenaming && (
                        <button
                            className="trip-detail-btn trip-detail-rename-btn"
                            onClick={() => setIsRenaming(true)}
                        >
                            ✏ Rename
                        </button>
                    )}


                    <button className="trip-detail-btn trip-detail-delete-btn" onClick={handleDelete}>
                        🗑 Delete
                    </button>

                </div>


            </div>





            <hr />



            <div className="trip-detail-section-header">

                <h2>Trip Stops</h2>

                <span>
                    {locations.length} Stops
                </span>

            </div>



            <div className="add-buttons">


                <button
                    type="button"
                    className="trip-detail-btn trip-detail-add-btn"
                    onClick={() => setIsStoppingPointDialogOpen(true)}
                >
                    + Add Stopping Point
                </button>


            </div>





            <div className="location-list">

                <DndContext
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >

                    <SortableContext
                        items={locations}
                        strategy={verticalListSortingStrategy}
                    >

                        {locations.map((location, index) => (

                            <SortableLocationCard
                                key={location.id}
                                location={location}
                                index={index}
                                onDelete={removeLocation}
                            />

                        ))}

                    </SortableContext>

                </DndContext>

            </div>





            {isStoppingPointDialogOpen && (
                <div
                    className="stopping-point-dialog-backdrop"
                    onMouseDown={closeStoppingPointDialog}
                >
                    <section
                        className="stopping-point-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="stopping-point-dialog-title"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <h2 id="stopping-point-dialog-title">Add Stopping Point</h2>

                        <label className="stopping-point-search-label" htmlFor="stopping-point-search">
                            Search hidden gems
                        </label>
                        <input
                            id="stopping-point-search"
                            type="search"
                            className="stopping-point-search"
                            placeholder="Search by name"
                            autoComplete="off"
                        />

                        <div className="stopping-point-map" aria-label="Map of hidden gems">
                            <MapContainer
                                center={[20, 0]}
                                zoom={2}
                                scrollWheelZoom
                                className="stopping-point-leaflet-map"
                            >
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                            </MapContainer>
                        </div>

                        <div className="stopping-point-dialog-actions">
                            <button
                                type="button"
                                className="stopping-point-cancel-btn"
                                onClick={closeStoppingPointDialog}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="stopping-point-confirm-btn"
                                disabled
                            >
                                Add
                            </button>
                        </div>
                    </section>
                </div>
            )}

            <button className="trip-detail-btn trip-detail-route-btn">
                🗺 Open Route in Google Maps
            </button>



        </div>

    );

}
