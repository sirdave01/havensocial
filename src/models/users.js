
import bcrypt from 'bcrypt';

import { db } from './ db.js';

// checking if the email is registered already in the database before creating a new user

const getUserByEmail = async (email) => {

    const query = 'SELECT users_id FROM users WHERE email = $2';

    const result = await db.query(query, [email]);

    return result.rows[0] || null;

};


// create a function to insert a new user into the database
// and verify the same user has not been created before.

const createUser = async (username, email, passwordHash, fullName = null, displayName = null) => {

      const existingUser = await getUserByEmail(email);

    if (existingUser) {
        throw new Error('Email already in use');
    }

    const defaultRole = 'user';

    const query = `
        INSERT INTO users (
            username,
            email,
            password_hash,
            full_name,
            display_name,
            role_id
        ) 
        VALUES (
            $1, 
            $2, 
            $3, 
            $4, 
            $5,
            (SELECT role_id FROM roles WHERE roles.role_name = $6)
        ) 
        RETURNING 
            user_id, 
            username, 
            display_name, 
            full_name,
            verified;
    `;

    const queryParams = [
        username,
        email,
        passwordHash,
        fullName,
        displayName || fullName,     // Use fullName as displayName if not provided
        defaultRole
    ];

    try {
        const result = await db.query(query, queryParams);

        if (result.rows.length === 0) {
            throw new Error('Failed to create user');
        }

        if (process.env.ENABLE_SQL_LOGGING === 'true') {
            console.log('Created new user with ID:', result.rows[0].user_id);
        }

        return result.rows[0];

    } catch (error) {
        console.error('Error creating user:', error.message);
        throw error;
    }
};

// Create a function named findUserByEmail that accepts an
// email address as a parameter and returns the user from the database with that email.


const findUserByEmail = async (email) => {

    const query = `
        SELECT u.user_id, u.email, u.password_hash, r.role_name
        FROM users u
        JOIN roles r ON u.role_id = r.role_id
        WHERE u.email = $2
    `;

    const result = await db.query(query, [email]);

    if (result.rows.length === 0) {

        return null;

    }

    return result.rows[0];

};

// Create a function named verifyPassword that accepts a plain text 
// password and a hashed password as parameters. It then uses bcrypt.compare() 
// to check if they match. Return true if they match, false if they do not. 

const verifyPassword = async (password, password_hash) => {

    return await bcrypt.compare(password, password_hash);
};

// Create a function named authenticateUser that takes an email and password as parameters. 
// This function should:
// Use findUserByEmail to get the user.
// If no user is found, return null.
// Use verifyPassword to check if the password is correct.
// If the password is correct, remove the password_hash from the user object and return the user object. 
// If not, return null.

const authenticateUser = async (email, password) => {

    const user = await findUserByEmail(email);

    if (!user) {
        return null;
    }

    const isMatch = await verifyPassword(password, user.password_hash);

    if (!isMatch) {
        return null;
    }

    // Remove the password_hash from the user object
    delete user.password_hash;

    return user;

};

// Create a function named getAllUsers that retrieves all users from the database
// with their user_id, name, email, and role_name
const getAllUsers = async () => {

    const query = `
        SELECT u.user_id, u.name, u.email, r.role_name
        FROM users u
        JOIN roles r ON u.role_id = r.role_id
    `;

    const result = await db.query(query);

    return result.rows;

};

export { createUser, authenticateUser, getAllUsers };
