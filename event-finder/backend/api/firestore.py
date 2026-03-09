import os
import json
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# This is the magic line that reads your .env file!
load_dotenv() 

def get_db():
    if not firebase_admin._apps:
        # Now os.environ will successfully find your JSON string
        sa_json = os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"]
        
        cred = credentials.Certificate(json.loads(sa_json))
        firebase_admin.initialize_app(cred)
        
    return firestore.client()

# Test it out!
db = get_db()
print("Successfully connected to Firestore!")
