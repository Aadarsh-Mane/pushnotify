import { google } from 'googleapis';
import express from "express";
import axios from 'axios';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

const PORT = process.env.PORT || 5000;
// import key from './myschool.json' with { type: "json" };

const app = express();
app.use(express.json()); // Parse JSON-encoded bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
const tokens = [];
const tokenspecific = [];

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.projectid,
    clientEmail: process.env.client_email,

    privateKey: process.env.private_key,

    }),
    // Replace with your Firebase project config
    databaseURL: 'https://myschool-44d2f.firebaseio.com/'
  });
  
  const firestore = admin.firestore();
//   app.get('/collections', async (req, res) => {
//     try {
//       const collections = await firestore.listCollections();
//       const collectionIds = collections.map((col) => col.id);
//       const collectionLengths = await Promise.all(
//         collectionIds.map(async (id) => {
//           const snapshot = await firestore.collection(id).get();
//           return snapshot.size;
//         })
//       );
//       const collectionInfo = collectionIds.map((id, index) => ({
//         id: id,
//         length: collectionLengths[index],
//       }));
//       res.json({ collections: collectionInfo });
//     } catch (error) {
//       console.error('Error fetching collections:', error);
//       res.status(500).json({ error: 'Failed to fetch collections' });
//     }
//   });
  // Variable to store the initial length of the 'notes' collection
  let initialNotesLength = 1;
  let lastSentNotification = null; // To track the last sent notification
  
  // Function to send notification
  const sendNotification = async (message) => {
    try {
      const accessToken = await getAccessToken();
      const querySnapshot = await firestore.collection('fcmtokens').get();
      const tokenspecific = [];
  
      // Collect tokens and their document IDs
      querySnapshot.forEach(doc => {
        tokenspecific.push({ id: doc.id, token: doc.data().token });
      });
  
      const notification = {
        title: 'New announcement!',
        body: message,
      };
  
      // Counters for tracking results
      let successfulNotifications = 0;
      let invalidTokens = 0;
  
      // Send notification to each token
      for (let i = 0; i < tokenspecific.length; i++) {
        const payload = {
          message: {
            token: tokenspecific[i].token,
            notification: notification,
          }
        };
  
        try {
          // Attempt to send the notification
          await axios.post(
            `https://fcm.googleapis.com/v1/projects/myschool-44d2f/messages:send`,
            payload,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
  
          console.log(`Notification sent to token ${tokenspecific[i].token}`);
          successfulNotifications++;
  
        } catch (error) {
          console.error(`Error sending to token ${tokenspecific[i].token}:`, error.response ? error.response.data : error.message);
  
          // Handle invalid tokens
          if (error.response && error.response.data.error) {
            const errorCode = error.response.data.error.code;
            const errorMessage = error.response.data.error.message;
  
            // Detect invalid tokens
            if (errorCode === 404 || errorMessage.includes('registration token is not a valid FCM registration token') || errorMessage.includes('not registered')) {
              // Remove invalid token from Firestore
              await firestore.collection('fcmtokens').doc(tokenspecific[i].id).delete();
              console.log(`Removed invalid token ${tokenspecific[i].token}`);
              invalidTokens++;
            }
          }
        }
      }
  
      console.log(`Notifications sent successfully: ${successfulNotifications}`);
      console.log(`Invalid tokens removed: ${invalidTokens}`);
    } catch (error) {
      console.error('Error sending notifications:', error.response ? error.response.data : error.message);
    }
  };
  
  // Monitor 'notes' collection for changes
  const startMonitoringNotesCollection = async () => {
    try {
      const notesRef = firestore.collection('notes');
  
      // Initial snapshot to get the current length
      const initialSnapshot = await notesRef.get();
      initialNotesLength = initialSnapshot.size;
  
      // Watch for changes in 'notes' collection
      notesRef.onSnapshot(snapshot => {
        const currentLength = snapshot.size;
  
        // Check if new data was added
        if (currentLength > initialNotesLength) {
          // Iterate through document changes
          snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
              const addedData = change.doc.data();
              const message = `New announcement added: ${addedData.note}`; // Customize this message based on your document structure
              
              // Check if this notification has already been sent
              if (lastSentNotification !== message) {
                sendNotification(message);
                lastSentNotification = message; // Update last sent notification
              }
            }
          });
        }
  
        // Update initialNotesLength to current length for future comparisons
        initialNotesLength = currentLength;
      });
    } catch (error) {
      console.error('Error monitoring notes collection:', error);
    }
  };
  
  // Call function to start monitoring 'notes' collection
  startMonitoringNotesCollection();
  
  

// Endpoint to fetch 'notes' collection length
app.get('/notes', async (req, res) => {
  try {
    const notesRef = firestore.collection('notes');
    const snapshot = await notesRef.get();
    const notesLength = snapshot.size;
    res.json({ notesLength: notesLength });
  } catch (error) {
    console.error('Error fetching notes collection:', error);
    res.status(500).json({ error: 'Failed to fetch notes collection' });
  }
});


export const  getAccessToken=async()=> {
  const jwtClient = new google.auth.JWT(
    process.env.client_email,
    null,
    process.env.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging'], // Scope required for FCM
    null
  );

  try {
    const tokens = await jwtClient.authorize();
    // console.log("this  :"+tokens.access_token)
    return tokens.access_token;
  } catch (err) {
    res.json({error:err});
    console.error('Error fetching access token:', err);
    return null;
  }
}
app.post('/send-notification-all', async (req, res) => {
  try {
    const accessToken = await getAccessToken();

    // Retrieve all FCM tokens from Firestore
    const querySnapshot = await firestore.collection('fcmtokens').get();
    const tokens = [];
    querySnapshot.forEach(doc => {
      tokens.push({ id: doc.id, token: doc.data().token });
    });

    // Initialize counters for sent and invalid tokens
    let successfulNotifications = 0;
    let invalidTokens = 0;

    // Iterate through each token and send notification
    for (let i = 0; i < tokens.length; i++) {
      const message = {
        message: {
          token: tokens[i].token, // Use the current token in the iteration
          notification: {
            title: req.body.title,
            body: req.body.body,
          },
        },
      };

      try {
        // Send request to FCM API for current token
        const response = await axios.post(
          `https://fcm.googleapis.com/v1/projects/myschool-44d2f/messages:send`,
          message,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        console.log(`Notification sent to token ${tokens[i].token}`);
        successfulNotifications++;
      } catch (error) {
        console.error(`Error sending to token ${tokens[i].token}:`, error.response ? error.response.data : error.message);

        // Check if the error indicates the token is invalid
        if (error.response && (error.response.data.error.code === 404 || error.response.data.error.message.includes('registration token is not a valid FCM registration token'))) {
          // Remove invalid token from Firestore
          await firestore.collection('fcmtokens').doc(tokens[i].id).delete();
          console.log(`Removed invalid token ${tokens[i].token}`);
          invalidTokens++;
        }
      }
    }

    // Return summary of the notification sending process
    res.json({
      message: 'Notification process completed',
      successfulNotifications: successfulNotifications,
      invalidTokens: invalidTokens,
    });
  } catch (error) {
    console.error('Error sending notifications to all devices:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

// app.get("/", (req, res) => {
//     console.log("hello")
// res.json({messafe:"hello"})
// console.log("hello")
// });
app.get('/', (req, res) => {
    console.log('Received GET request at /');

    res.json({ message: 'Server is running' });
  })
  // checking port on local server
  app.listen(PORT, () => {
    console.log(`listening on ${PORT}`);
  });