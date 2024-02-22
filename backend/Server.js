const express = require('express');
const cors = require('cors');
const MongoClient = require('mongodb').MongoClient;
const ExcelJS = require('exceljs');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { promisify } = require('util');
const cron = require('node-cron');

const app = express();
const port = process.env.PORT || 4000; // Use the provided port or default to 4000

app.use(cors());

const mongoUri = process.env.MONGO_URI; // Use environment variable for MongoDB URI
const databaseName = process.env.DATABASE_NAME || "test"; // Use environment variable for database name or default to "test"

async function exportCollectionsToCSV() {
  const client = new MongoClient(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db(databaseName);

    const collections = await database.listCollections().toArray();

    const workbook = new ExcelJS.Workbook();

    for (const collection of collections) {
      const collectionName = collection.name;
      const sheet = workbook.addWorksheet(collectionName);

      const cursor = await database.collection(collectionName).find();
      const data = await cursor.toArray();

      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        sheet.addRow(headers);

        for (const row of data) {
          const values = headers.map((header) => row[header]);
          sheet.addRow(values);
        }
      }
    }

    const outputFilePath = 'output.xlsx';
    await workbook.xlsx.writeFile(outputFilePath);

    console.log(`Data exported successfully to ${outputFilePath}`);

    return outputFilePath;
  } finally {
    await client.close();
  }
}

app.get('/download-excel', async (req, res) => {
  try {
    const filePath = await exportCollectionsToCSV();

    // Send the file to the client
    res.download(filePath, 'output.xlsx', (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        res.status(500).send('Internal Server Error');
      } else {
        fs.unlinkSync(filePath);
      }
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/collections', async (req, res) => {
  const client = new MongoClient(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db(databaseName);

    const collections = await database.listCollections().toArray();
    const collectionNames = collections.map(collection => collection.name);

    res.json(collectionNames);
  } catch (error) {
    console.error('Error fetching collection names:', error);
    res.status(500).send('Internal Server Error');
  } finally {
    await client.close();
  }
});

app.get('/collection-data', async (req, res) => {
  const collectionName = req.query.name;
  if (!collectionName) {
    return res.status(400).send('Collection name is required');
  }

  const client = new MongoClient(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db(databaseName);

    const collection = database.collection(collectionName);
    const data = await collection.find().toArray();

    res.json(data);
  } catch (error) {
    console.error(`Error fetching data for collection ${collectionName}:`, error);
    res.status(500).send('Internal Server Error');
  } finally {
    await client.close();
  }
});

const gmailCredentials = {
  email: 'Sona.cse.sympo@gmail.com',
  password: 'sabzvrimgumxfihr',
};

const sendEmail = async () => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailCredentials.email,
      pass: gmailCredentials.password,
    },
  });

  const mailOptions = {
    from: gmailCredentials.email,
    to: 'threads.cse@sonatech.ac.in',
    subject: 'CSV Export',
    text: 'Vanakam Da Mapla, This is the attachment of the database for every 5 Mins.',
    attachments: [
      {
        filename: 'output.xlsx',
        path: 'output.xlsx',
      },
    ],
  };

  const sendMailAsync = promisify(transporter.sendMail).bind(transporter);

  try {
    const info = await sendMailAsync(mailOptions);
    console.log('Email sent:', info.response);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

cron.schedule('*/5 * * * *', async () => {
  console.log('Exporting data and sending email...');

  try {
    const filePath = await exportCollectionsToCSV();
    await sendEmail();
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error('Error in cron job:', error);
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
