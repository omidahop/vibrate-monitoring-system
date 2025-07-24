#!/bin/bash
set -e

# Wait for CouchDB to be ready
echo "Waiting for CouchDB to be ready..."
while ! curl -f -s http://couchdb:5984/_up > /dev/null 2>&1; do
    echo "CouchDB is not ready yet. Waiting..."
    sleep 5
done
echo "CouchDB is ready!"

# Wait a bit more to ensure CouchDB is fully initialized
sleep 10

# Start the Node.js application
exec node src/app.js