import { useEffect, useState } from "react";
import { getMenuItems, addMenuItem, toggleMenuItemLike, deleteMenuItem } from "../api/menuItems";
import Spinner from "./Spinner";

// Community suggested menu items
function MenuItems({ locationId, currentUser, onRequireSignIn, frozen = false }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState("");
    const [price, setPrice] = useState("");
    const [adding, setAdding] = useState(false);
    const [message, setMessage] = useState("");
    const [busyId, setBusyId] = useState(null);

    const fetchItems = () => {
        setLoading(true);
        getMenuItems(locationId)
            .then((res) => setItems(res.data.data || []))
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchItems();
    }, [locationId]);

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!currentUser) {
            onRequireSignIn("Login to suggest a menu item.");
            return;
        }
        if (!name.trim()) return;

        setAdding(true);
        setMessage("");
        try {
            await addMenuItem(locationId, { name: name.trim(), price: price || undefined });
            setName("");
            setPrice("");
            fetchItems();
        } catch (error) {
            setMessage(error?.response?.data?.message || "Could not add this item.");
        } finally {
            setAdding(false);
        }
    };

    const handleLike = async (item) => {
        if (!currentUser) {
            onRequireSignIn("Login to like a menu item.");
            return;
        }
        if (busyId) return;

        setBusyId(item.id);
        setItems((prev) => prev.map((i) => i.id === item.id
            ? { ...i, liked_by_me: !i.liked_by_me, like_count: i.like_count + (i.liked_by_me ? -1 : 1) }
            : i));
        try {
            await toggleMenuItemLike(item.id);
        } catch (error) {
            fetchItems();
        } finally {
            setBusyId(null);
        }
    };

    const handleRemove = async (item) => {
        if (busyId) return;
        setBusyId(item.id);
        try {
            await deleteMenuItem(item.id);
            setItems((prev) => prev.filter((i) => i.id !== item.id));
        } catch (error) {
            setMessage(error?.response?.data?.message || "Could not remove this item.");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="menu-items">
            {loading && <Spinner size="sm" inline label="Loading menu items…" />}

            {!loading && items.length === 0 && (
                <p className="side-panel-nearby-status">No items suggested yet — be the first to add one you tried.</p>
            )}

            {!loading && items.length > 0 && (
                <ul className="menu-items-list">
                    {items.map((item) => (
                        <li key={item.id} className="menu-items-item">
                            <div className="menu-items-item-info">
                                <span className="menu-items-item-name">{item.name}</span>
                                {item.price != null && (
                                    <span className="menu-items-item-price">RM {Number(item.price).toFixed(2)}</span>
                                )}
                                {item.added_by && (
                                    <span className="menu-items-item-by">suggested by {item.added_by}</span>
                                )}
                            </div>
                            <div className="menu-items-item-actions">
                                <button
                                    type="button"
                                    className={`menu-items-like-btn ${item.liked_by_me ? "active" : ""}`}
                                    onClick={() => handleLike(item)}
                                    disabled={busyId === item.id || frozen}
                                    title={item.liked_by_me ? "Unlike" : "Like this item"}
                                >
                                    👍 {item.like_count}
                                </button>
                                {currentUser && String(item.added_by_user_id) === String(currentUser.id) && (
                                    <button
                                        type="button"
                                        className="menu-items-remove-btn"
                                        onClick={() => handleRemove(item)}
                                        disabled={busyId === item.id}
                                        title="Remove this item"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {frozen ? (
                <p className="side-panel-nearby-status">This place is marked permanently closed — the menu is frozen.</p>
            ) : (
                <form className="menu-items-add-form" onSubmit={handleAdd}>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Item you tried (e.g. Kuih Lapis)"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={80}
                    />
                    <input
                        type="number"
                        className="form-input menu-items-price-input"
                        placeholder="RM (optional)"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        min="0"
                        step="0.01"
                    />
                    <button type="submit" className="menu-items-add-btn" disabled={adding || !name.trim()}>
                        {adding ? "Adding…" : "Add"}
                    </button>
                </form>
            )}
            {message && <p className="side-panel-itinerary-status error">{message}</p>}
        </div>
    );
}

export default MenuItems;
