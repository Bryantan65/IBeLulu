"""
Watson JWT Generator for IBM watsonx Orchestrate
Generates RS256-signed JWTs with encrypted user payload
"""

import jwt
import json
import base64
from datetime import datetime, timedelta
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend


class WatsonJWTGenerator:
    """Generate RS256-signed JWTs for Watson Orchestrate"""
    
    def __init__(self, private_key_pem: str = None, ibm_public_key_pem: str = None,
                 private_key_path: str = None, ibm_public_key_path: str = None):
        """
        Initialize with RSA keys.
        
        Args:
            private_key_pem: Your private key as PEM string
            ibm_public_key_pem: IBM's public key as PEM string
            private_key_path: Path to your private key file
            ibm_public_key_path: Path to IBM's public key file
        """
        # Load private key
        if private_key_pem:
            self.private_key = serialization.load_pem_private_key(
                private_key_pem.encode('utf-8'),
                password=None,
                backend=default_backend()
            )
        elif private_key_path:
            with open(private_key_path, 'rb') as f:
                self.private_key = serialization.load_pem_private_key(
                    f.read(),
                    password=None,
                    backend=default_backend()
                )
        else:
            raise ValueError("Must provide private_key_pem or private_key_path")
        
        # Load IBM public key
        if ibm_public_key_pem:
            self.ibm_public_key = serialization.load_pem_public_key(
                ibm_public_key_pem.encode('utf-8'),
                backend=default_backend()
            )
        elif ibm_public_key_path:
            with open(ibm_public_key_path, 'rb') as f:
                self.ibm_public_key = serialization.load_pem_public_key(
                    f.read(),
                    backend=default_backend()
                )
        else:
            raise ValueError("Must provide ibm_public_key_pem or ibm_public_key_path")
    
    def encrypt_user_payload(self, user_data: dict) -> str:
        """
        Encrypt user data with IBM's public key using RSA-OAEP.
        
        Args:
            user_data: Dictionary of user data to encrypt
            
        Returns:
            Base64-encoded encrypted string
        """
        user_json = json.dumps(user_data)
        user_bytes = user_json.encode('utf-8')
        
        # Use OAEP padding with SHA256 (as per IBM's requirements)
        encrypted = self.ibm_public_key.encrypt(
            user_bytes,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        
        return base64.b64encode(encrypted).decode('utf-8')
    
    def generate_token(self, user_id: str, user_data: dict = None, 
                       context: dict = None, expires_in_hours: int = 24) -> str:
        """
        Generate a signed JWT token for Watson Orchestrate.
        
        Args:
            user_id: Unique identifier for the user
            user_data: Optional user data to encrypt (name, email, etc.)
            context: Optional context data (NOT encrypted, accessible by agent)
            expires_in_hours: Token validity period
            
        Returns:
            Signed JWT token string
        """
        now = datetime.utcnow()
        
        payload = {
            'sub': user_id,
            'iat': int(now.timestamp()),
            'exp': int((now + timedelta(hours=expires_in_hours)).timestamp())
        }
        
        # Add encrypted user_payload if provided
        if user_data:
            payload['user_payload'] = self.encrypt_user_payload(user_data)
        
        # Add context if provided (NOT encrypted, accessible by agent)
        if context:
            payload['context'] = context
        
        # Sign with RS256
        token = jwt.encode(payload, self.private_key, algorithm='RS256')
        
        return token


# For testing
if __name__ == '__main__':
    import os
    
    private_key = os.environ.get('WATSON_PRIVATE_KEY')
    ibm_public_key = os.environ.get('IBM_PUBLIC_KEY')
    
    if private_key and ibm_public_key:
        generator = WatsonJWTGenerator(
            private_key_pem=private_key,
            ibm_public_key_pem=ibm_public_key
        )
        
        token = generator.generate_token(
            user_id="test-user-123",
            user_data={"name": "Test User", "email": "test@example.com"},
            context={"source": "test"}
        )
        
        print("Generated token:")
        print(token[:100] + "...")
    else:
        print("Set WATSON_PRIVATE_KEY and IBM_PUBLIC_KEY environment variables")
