const { google } = require('googleapis');
const fs = require('fs');

async function test() {
  try {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const folderIdMatch = envFile.match(/GOOGLE_DRIVE_FOLDER_ID=(.*)/);
    const emailMatch = envFile.match(/GOOGLE_SERVICE_ACCOUNT_EMAIL=(.*)/);
    const keyMatch = envFile.match(/GOOGLE_PRIVATE_KEY="(.*)"/);

    if (!folderIdMatch || !emailMatch || !keyMatch) throw new Error("Missing env vars in .env.local");

    const auth = new google.auth.JWT({
      email: emailMatch[1].trim(),
      key: keyMatch[1].replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });
    const folderId = folderIdMatch[1].trim();
    
    console.log('Fetching folder:', folderId);
    
    // First check if we can even GET the folder
    const res = await drive.files.get({ 
      fileId: folderId, 
      fields: 'id, name, capabilities, permissions', 
      supportsAllDrives: true 
    });
    
    console.log('SUCCESS: We can read the folder!');
    console.log('- Name:', res.data.name);
    console.log('- Can add children?', res.data.capabilities?.canAddChildren);

    if (!res.data.capabilities?.canAddChildren) {
      console.log('FAILED: The service account does not have Editor (write) access to add files to this folder. It only has Viewer access.');
    } else {
      console.log('PERMISSIONS OK! The service account has write access.');
    }

  } catch(e) { 
    console.error('ERROR:', e.message); 
  }
}
test();
