// importing the Notification functions from the models

import { getNotifications, markAsRead } from '../models/notification.js';

export const getNotificationsController = async (req, res) => {
    try {
        const userId = req.user.users_id;
        const { limit = 20 } = req.query;

        const notifications = await getNotifications(userId, parseInt(limit));
        res.json(notifications);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching notifications" });
    }
};

export const markAsReadController = async (req, res) => {
    try {
        const userId = req.user.users_id;
        const { notificationId } = req.params;

        await markAsRead(notificationId, userId);
        res.json({ message: "Notification marked as read" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error marking notification as read" });
    }
};

export const showNotificationsPage = async (req, res) => {
    try {
        if (!req.session?.user) {
            return res.redirect('/login');
        }

        const userId = req.session.user.users_id;
        const { limit = 30 } = req.query;

        const notifications = await getNotifications(userId, parseInt(limit));

        res.render('notifications', {
            title: 'Notifications',
            notifications,
            user: req.session.user,
            isLoggedIn: true
        });
    } catch (error) {
        console.error('Notifications page error:', error);
        req.flash('error', 'Could not load notifications');
        res.redirect('/feed');
    }
};