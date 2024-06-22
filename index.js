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

// Function to send notification
const sendNotification = async (message) => {
  try {
    const accessToken = await getAccessToken();
    const querySnapshot = await firestore.collection('fcmtokens').get();
    querySnapshot.forEach(doc => {
      tokenspecific.push(doc.data().token);
    });

    const notification = {
      title: 'New announcement !',
      body: message,
    };
    for (let i = 0; i < tokenspecific.length; i++) {

    const payload = {
      message: {
        token: tokenspecific[i],
                notification: notification,
      }
    };
    
    const response = await axios.post(
      `https://fcm.googleapis.com/v1/projects/myschool-44d2f/messages:send`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // console.log('Notification sent:', response.data);
  }
  } catch (error) {
    console.error('Error sending notification:', error.response ? error.response.data : error.message);
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

      // Check if new data was added (assuming initialNotesLength = 1)
      if (currentLength > initialNotesLength) {
        // Get the latest added document
        const addedDoc = snapshot.docChanges().find(change => change.type === 'added');
        if (addedDoc) {
          const addedData = addedDoc.doc.data();
          const message = `New announcement added do check: ${addedData.note}`; // Customize this message based on your document structure
          sendNotification(message);
        }
      }

      // Update initialNotesLength to current length for future comparisons
      initialNotesLength = currentLength;
    });
  } catch (error) {
    res.json({ error: error})
    // console.error('Error monitoring notes collection:', error);
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
    querySnapshot.forEach(doc => {
      tokens.push(doc.data().token);
    });

    // Iterate through each token and send notification
    for (let i = 0; i < tokens.length; i++) {
      const message = {
        message: {
          token: tokens[i], // Use the current token in the iteration
          notification: {
            title: req.body.title,
            body: req.body.body,
          },
        },
      };

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

      // Log success response or handle as needed
      console.log(`Notification sent to token ${tokens[i]}`);
    }

    // Return success message if needed
    res.json({ message: 'Notifications sent successfully to all devices' });
  } catch (error) {
    console.error('Error sending notification to all devices:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

app.post('/send-notification', async (req, res) => {
    try {
      // Get OAuth 2.0 access token
      const accessToken = await getAccessToken();
  
      // Construct the message payload
    //   console.log("sdsdsd",req.body.token);

      const message = {
        message: {
          token: req.body.token, // Device registration token
          notification: {
            title: req.body.title,
            body: req.body.body,
          },
        },
      };
  
      // Send request to FCM API
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
  
      // Return response from FCM API
      res.json(response.data);
    } catch (error) {
      console.error('Error sending notification:', error.response ? error.response.data : error.message);
      res.status(500).json({ error: 'Failed to send notification' });
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