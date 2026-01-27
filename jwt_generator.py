from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
import jwt
import json
import base64
from datetime import datetime, timedelta

class WatsonxJWTGenerator:
    def __init__(self, private_key_path, ibm_public_key_path):
        with open(private_key_path, 'rb') as f:
            self.private_key = serialization.load_pem_private_key(f.read(), password=None)
        with open(ibm_public_key_path, 'rb') as f:
            self.ibm_public_key = serialization.load_pem_public_key(f.read())
    
    def encrypt_user_payload(self, user_data):
        user_json = json.dumps(user_data)
        user_bytes = user_json.encode('utf-8')
        encrypted = self.ibm_public_key.encrypt(
            user_bytes,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        return base64.b64encode(encrypted).decode('utf-8')
    
    def generate_token(self, user_id, user_data=None, context=None, expires_in_hours=24):
        payload = {'sub': user_id}
        if user_data:
            payload['user_payload'] = self.encrypt_user_payload(user_data)
        if context:
            payload['context'] = context
        
        now = datetime.utcnow()
        payload['iat'] = int(now.timestamp())
        payload['exp'] = int((now + timedelta(hours=expires_in_hours)).timestamp())
        
        return jwt.encode(payload, self.private_key, algorithm='RS256')
