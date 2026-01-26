"""
JWT Token Generator for watsonx Orchestrate Embedded Chat
Generates RS256-signed JWT tokens with encrypted user payload
"""

import jwt
import json
from datetime import datetime, timedelta
from pathlib import Path
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend
import base64


class WatsonxJWTGenerator:
    """Generate JWT tokens for watsonx Orchestrate embedded chat authentication"""
    
    def __init__(self, private_key_path: str, ibm_public_key_path: str):
        """
        Initialize the JWT generator
        
        Args:
            private_key_path: Path to your client private key (example-jwtRS256.key)
            ibm_public_key_path: Path to IBM public key (ibmPublic.key.pub)
        """
        self.private_key_path = Path(private_key_path)
        self.ibm_public_key_path = Path(ibm_public_key_path)
        
        # Load private key for signing
        with open(self.private_key_path, 'rb') as key_file:
            self.private_key = serialization.load_pem_private_key(
                key_file.read(),
                password=None,
                backend=default_backend()
            )
        
        # Load IBM public key for encrypting user payload
        with open(self.ibm_public_key_path, 'rb') as key_file:
            self.ibm_public_key = serialization.load_pem_public_key(
                key_file.read(),
                backend=default_backend()
            )
    
    def encrypt_user_payload(self, user_data: dict) -> str:
        """
        Encrypt user data using IBM's public key with OAEP padding and SHA256
        (matches the Node.js crypto.publicEncrypt implementation)
        
        Args:
            user_data: Dictionary containing user information
            
        Returns:
            Base64-encoded encrypted user payload
        """
        # Convert user data to JSON string
        user_json = json.dumps(user_data)
        user_bytes = user_json.encode('utf-8')
        
        # Encrypt using IBM's public key with OAEP padding and SHA256
        # This matches: crypto.publicEncrypt with RSA_PKCS1_OAEP_PADDING and oaepHash: 'sha256'
        encrypted = self.ibm_public_key.encrypt(
            user_bytes,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        
        # Return base64-encoded encrypted data
        return base64.b64encode(encrypted).decode('utf-8')
    
    def generate_token(self, user_id: str, user_data: dict = None, context: dict = None, expires_in_hours: int = 24) -> str:
        """
        Generate a signed JWT token for watsonx Orchestrate
        (matches the Node.js reference implementation)
        
        Args:
            user_id: Unique identifier for the user (sub field)
            user_data: Optional dictionary with user information to be encrypted
            context: Optional context dictionary (not encrypted, accessible by agent)
            expires_in_hours: Token expiration time in hours (default: 24)
            
        Returns:
            Signed JWT token string
        """
        # Prepare base payload
        payload = {
            'sub': user_id,  # Subject (user ID)
        }
        
        # Add encrypted user_payload if user_data is provided
        if user_data:
            encrypted_payload = self.encrypt_user_payload(user_data)
            payload['user_payload'] = encrypted_payload
        
        # Add context if provided (not encrypted)
        if context:
            payload['context'] = context
        
        # Sign the token with RS256
        token = jwt.encode(
            payload,
            self.private_key,
            algorithm='RS256',
            headers={'typ': 'JWT'}
        )
        
        # Add expiration using PyJWT's built-in support
        now = datetime.utcnow()
        payload_with_exp = payload.copy()
        payload_with_exp['iat'] = int(now.timestamp())
        payload_with_exp['exp'] = int((now + timedelta(hours=expires_in_hours)).timestamp())
        
        token = jwt.encode(
            payload_with_exp,
            self.private_key,
            algorithm='RS256'
        )
        
        return token
    
    def verify_token(self, token: str) -> dict:
        """
        Verify and decode a JWT token (for testing purposes)
        
        Args:
            token: JWT token string
            
        Returns:
            Decoded token payload
        """
        # Load the public key for verification
        with open(self.private_key_path.parent / 'example-jwtRS256.key.pub', 'rb') as key_file:
            public_key = serialization.load_pem_public_key(
                key_file.read(),
                backend=default_backend()
            )
        
        # Verify and decode
        decoded = jwt.decode(
            token,
            public_key,
            algorithms=['RS256']
        )
        
        return decoded


def main():
    """Example usage"""
    print("=" * 60)
    print("watsonx Orchestrate JWT Token Generator")
    print("=" * 60)
    
    # Initialize generator
    generator = WatsonxJWTGenerator(
        private_key_path='keys/example-jwtRS256.key',
        ibm_public_key_path='keys/ibmPublic.key.pub'
    )
    
    # Example: Generate token for a user
    user_id = "demo-user-123"
    user_data = {
        "email": "demo@example.com",
        "name": "Demo User",
        "role": "test_user"
    }
    
    print(f"\n🔐 Generating JWT token for user: {user_id}")
    token = generator.generate_token(user_id, user_data, expires_in_hours=24)
    
    print(f"\n✅ Token generated successfully!")
    print(f"\nToken (copy this for your HTML):")
    print("-" * 60)
    print(token)
    print("-" * 60)
    
    # Verify the token
    print(f"\n🔍 Verifying token...")
    decoded = generator.verify_token(token)
    print(f"\n✅ Token verified successfully!")
    print(f"\nDecoded payload:")
    print(json.dumps(decoded, indent=2))
    
    # Generate JavaScript code snippet
    print(f"\n📋 JavaScript code to add to your HTML:")
    print("-" * 60)
    print(f"""
// Add this before wxoLoader.init()
window.wxOConfiguration.chatOptions.identityToken = "{token}";
    """)
    print("-" * 60)
    
    print(f"\n✨ Done! Your embedded chat is now ready with authentication.")


if __name__ == "__main__":
    main()
