import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';

// Global variables provided by the Canvas environment for Firebase setup
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Main App Component
const App = () => {
    // State variables
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [items, setItems] = useState([]);
    const [newItemName, setNewItemName] = useState('');
    const [newItemQuantity, setNewItemQuantity] = useState(1);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState(''); // For user feedback

    // Initialize Firebase and authenticate
    useEffect(() => {
        const initFirebase = async () => {
            try {
                // Initialize Firebase app if not already initialized
                const firebaseApp = initializeApp(firebaseConfig);
                const firestoreDb = getFirestore(firebaseApp);
                const firebaseAuth = getAuth(firebaseApp);

                setDb(firestoreDb);
                setAuth(firebaseAuth);

                // Set up authentication state listener
                const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                    if (user) {
                        setUserId(user.uid);
                    } else {
                        // Sign in anonymously if no user is found or initial token is not provided
                        try {
                            if (initialAuthToken) {
                                await signInWithCustomToken(firebaseAuth, initialAuthToken);
                            } else {
                                await signInAnonymously(firebaseAuth);
                            }
                            setUserId(firebaseAuth.currentUser?.uid || crypto.randomUUID()); // Fallback if anonymous sign-in takes time
                        } catch (error) {
                            console.error("Error during anonymous sign-in:", error);
                            setFeedbackMessage("Authentication failed. Please try again later.");
                        }
                    }
                    setIsAuthReady(true); // Mark authentication as ready
                });

                return () => unsubscribe(); // Cleanup listener on component unmount
            } catch (error) {
                console.error("Error initializing Firebase:", error);
                setFeedbackMessage("Failed to initialize the app. Please check console for details.");
            }
        };

        if (!db) { // Only initialize if db is not already set
            initFirebase();
        }
    }, []); // Empty dependency array ensures this runs once on mount

    // Fetch and listen for real-time updates to items
    useEffect(() => {
        if (db && userId && isAuthReady) {
            const itemsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/refrigerator_inventory`);
            // Note: orderBy is commented out due to potential Firestore index issues in some environments.
            // Data will be sorted client-side for simplicity.
            const q = query(itemsCollectionRef); // , orderBy("timestamp", "desc")

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedItems = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                // Client-side sorting by timestamp (descending)
                fetchedItems.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
                setItems(fetchedItems);
            }, (error) => {
                console.error("Error fetching items:", error);
                setFeedbackMessage("Failed to load inventory. Please refresh.");
            });

            return () => unsubscribe(); // Cleanup listener
        }
    }, [db, userId, isAuthReady]); // Re-run when db, userId, or isAuthReady changes

    // Handle adding a new item
    const handleAddItem = async () => {
        if (!newItemName.trim() || newItemQuantity <= 0) {
            setFeedbackMessage("Please enter a valid item name and quantity.");
            return;
        }
        if (!db || !userId) {
            setFeedbackMessage("App not ready. Please wait for authentication.");
            return;
        }

        try {
            const itemsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/refrigerator_inventory`);
            await addDoc(itemsCollectionRef, {
                name: newItemName.trim(),
                quantity: newItemQuantity,
                timestamp: serverTimestamp() // Add a server timestamp
            });
            setNewItemName('');
            setNewItemQuantity(1);
            setFeedbackMessage('Item added successfully!');
            setTimeout(() => setFeedbackMessage(''), 3000); // Clear message after 3 seconds
        } catch (error) {
            console.error("Error adding item:", error);
            setFeedbackMessage("Failed to add item. Please try again.");
        }
    };

    // Handle deleting an item
    const handleDeleteItem = async (id) => {
        if (!db || !userId) {
            setFeedbackMessage("App not ready. Please wait for authentication.");
            return;
        }
        try {
            const itemDocRef = doc(db, `artifacts/${appId}/users/${userId}/refrigerator_inventory`, id);
            await deleteDoc(itemDocRef);
            setFeedbackMessage('Item removed successfully!');
            setTimeout(() => setFeedbackMessage(''), 3000); // Clear message after 3 seconds
        } catch (error) {
            console.error("Error deleting item:", error);
            setFeedbackMessage("Failed to remove item. Please try again.");
        }
    };

    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
                <div className="text-center text-lg font-medium text-gray-700">
                    Loading application...
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 p-4 font-inter text-gray-800">
            <div className="max-w-xl mx-auto bg-white rounded-xl shadow-lg p-6 md:p-8">
                <h1 className="text-3xl font-bold text-center text-blue-800 mb-6">
                    <i className="lucide lucide-冷蔵庫 inline-block mr-2 align-middle"></i> Refrigerator Inventory
                </h1>

                {/* User ID Display */}
                {userId && (
                    <p className="text-sm text-gray-500 text-center mb-4 truncate">
                        User ID: <span className="font-mono text-xs select-all">{userId}</span>
                    </p>
                )}

                {/* Feedback Message */}
                {feedbackMessage && (
                    <div className="bg-blue-100 text-blue-700 p-3 rounded-lg mb-4 text-center">
                        {feedbackMessage}
                    </div>
                )}

                {/* Add Item Form */}
                <div className="mb-8 p-4 bg-gray-50 rounded-lg shadow-inner">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Add New Item</h2>
                    <div className="flex flex-col sm:flex-row gap-3 mb-4">
                        <input
                            type="text"
                            placeholder="Item Name"
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                        />
                        <input
                            type="number"
                            min="1"
                            value={newItemQuantity}
                            onChange={(e) => setNewItemQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-24 p-3 border border-gray-300 rounded-lg text-center focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                        />
                    </div>
                    <button
                        onClick={handleAddItem}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                    >
                        Add Item
                    </button>
                </div>

                {/* Inventory List */}
                <div className="p-4 bg-gray-50 rounded-lg shadow-inner">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Your Inventory</h2>
                    {items.length === 0 ? (
                        <p className="text-center text-gray-500 py-4">No items in your refrigerator yet. Add some!</p>
                    ) : (
                        <ul className="space-y-3">
                            {items.map((item) => (
                                <li
                                    key={item.id}
                                    className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-gray-200 transition-transform duration-200 ease-in-out hover:scale-[1.01]"
                                >
                                    <div className="flex-grow">
                                        <p className="text-lg font-medium text-gray-800 capitalize">
                                            {item.name}
                                            <span className="ml-2 text-sm text-gray-500">
                                                (Qty: {item.quantity})
                                            </span>
                                        </p>
                                        {item.timestamp && (
                                            <p className="text-xs text-gray-400 mt-1">
                                                Added: {new Date(item.timestamp.toDate()).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="ml-4 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-md transition duration-300 ease-in-out transform hover:scale-110"
                                        aria-label={`Delete ${item.name}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2">
                                            <path d="M3 6h18"/>
                                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                                            <line x1="10" x2="10" y1="11" y2="17"/>
                                            <line x1="14" x2="14" y1="11" y2="17"/>
                                        </svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
