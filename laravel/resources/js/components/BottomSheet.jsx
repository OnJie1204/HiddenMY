import googleMapsIcon from "../assets/google_maps.png";
import wazeIcon from "../assets/waze.png";

function BottomSheet({
    gem,
    onClose
}){

    if(!gem){
        return null;
    }

    function openGoogleMaps(){
        const url =
        `https://www.google.com/maps/dir/?api=1&destination=${gem.latitude},${gem.longitude}`;
        window.open(
            url,
            "_blank"
        );
    }


    function openWaze(){
        const url =
        `https://www.waze.com/ul?ll=${gem.latitude},${gem.longitude}&navigate=yes`;
        window.open(
            url,
            "_blank"
        );
    }


    return (
        <div className="bottom-sheet">
            {/* Handle */}
            <div className="bottom-sheet-handle"/>

            <button
            onClick={onClose}
            style={{
                float:"right"
            }}
            >
                ✕
            </button>

            {
            gem.cover_image &&
            <img
            src={gem.cover_image}
<<<<<<< HEAD
            alt={gem.name}
=======
            alt={gem.title}
>>>>>>> Interactive-Map
            className="bottom-sheet-image"
            />
            }

            <h2>
<<<<<<< HEAD
            {gem.source === "database" ? "💎" : "📍"}
            {" "}
            {gem.name}
=======
            {gem.type === "hidden_gem" ? "💎" : "📍"}
            {" "}
            {gem.title}
>>>>>>> Interactive-Map
            </h2>

            {
            gem.state &&
            <p>{gem.state}</p>
            }

            <p>
                {gem.description ||
                "No description available."}
            </p>

            {gem.address &&
            <>
            <h4>Address</h4>
            <p>{gem.address}</p>
            </>
            }

            <div className="action-buttons">

            <button className="map-action-button" 
            onClick={openGoogleMaps}>
                <img
                src={googleMapsIcon}
                alt="Google Maps"
                />
            </button>

            <button className="map-action-button" 
            onClick={openWaze}>
                <img
                src={wazeIcon}
                alt="Waze"
                />
            </button>

            <button className="map-action-button itinerary">Add to Itinerary</button>
            </div>
            <hr/>
            <h3>Traveller Posts</h3>
            <p>No posts available.</p>
        </div>
    );
}
export default BottomSheet;