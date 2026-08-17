import imgNotFound from "../assets/img_not_found.png";

function GemImage({ src, alt, className, style }) {
    return (
        <img
            src={src || imgNotFound}
            alt={alt}
            className={className}
            style={style}
            onError={(e) => {
                e.target.onerror = null; 
                e.target.src = imgNotFound;
            }}
        />
    );
}

export default GemImage;
