import os
import sys

import certifi
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import PyMongoError

load_dotenv()
uri = os.getenv("MONGODB_URI", "")

if not uri:
    print("MongoDB test failed: MONGODB_URI is not configured.")
    sys.exit(1)
if not uri.startswith("mongodb+srv://"):
    print("MongoDB test failed: MONGODB_URI must start with mongodb+srv://.")
    sys.exit(1)

try:
    client = MongoClient(uri, tls=True, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=10000, connectTimeoutMS=10000, retryWrites=True)
    client.admin.command("ping")
    print("MongoDB connected successfully!")
except PyMongoError as error:
    print(f"MongoDB connection failed: {type(error).__name__}")
    print("Check the Atlas IP access list, database user, password, cluster hostname, and DNS/SRV resolution.")
    sys.exit(1)
finally:
    if "client" in locals():
        client.close()
