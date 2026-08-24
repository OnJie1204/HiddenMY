import { SPECIAL_ACHIEVEMENT_METADATA } from "../constants/specialAchievements";

export default function FavouriteAchievementBadges({ favourites = [], className = "" }) {
    const achievements = [...favourites]
        .sort((first, second) => first.position - second.position)
        .map((favourite) => SPECIAL_ACHIEVEMENT_METADATA[favourite.key])
        .filter(Boolean)
        .slice(0, 2);

    if (achievements.length === 0) return null;

    return (
        <span className={`favourite-achievement-badges ${className}`.trim()}>
            {achievements.map((achievement) => (
                <span
                    key={achievement.title}
                    className="favourite-achievement-badge"
                    title={achievement.title}
                    aria-label={`Favourite achievement: ${achievement.title}`}
                    tabIndex="0"
                >
                    <img src={achievement.artwork} alt="" />
                </span>
            ))}
        </span>
    );
}
