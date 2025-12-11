#!/usr/bin/env python3
"""
Script to create the initial super admin user for the admin panel
This should only be run once during initial setup

Usage:
    python backend/scripts/create_super_admin.py

Security:
    - Validates password strength
    - Hashes password before storage
    - Checks for existing super admin
    - Logs creation for audit trail
"""

import os
import sys
from getpass import getpass
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from sqlalchemy import text
import bcrypt


def validate_password(password: str) -> tuple[bool, str]:
    """
    Validate password meets security requirements
    Returns (is_valid, error_message)
    """
    if len(password) < 12:
        return False, "Password must be at least 12 characters"
    
    if not any(c.isupper() for c in password):
        return False, "Password must contain uppercase letters"
    
    if not any(c.islower() for c in password):
        return False, "Password must contain lowercase letters"
    
    if not any(c.isdigit() for c in password):
        return False, "Password must contain numbers"
    
    if not any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?/' for c in password):
        return False, "Password must contain special characters"
    
    # Check for common passwords (basic check)
    common_passwords = ['password', '12345678', 'admin123', 'welcome']
    if any(common in password.lower() for common in common_passwords):
        return False, "Password is too common"
    
    return True, ""


def hash_password(password: str) -> str:
    """Hash password using bcrypt with cost factor 12"""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def validate_email(email: str) -> bool:
    """Basic email validation"""
    return '@' in email and '.' in email.split('@')[1]


def create_super_admin():
    """Create super admin user"""
    print("\n" + "="*60)
    print("🔐 MediLink Admin Panel - Super Admin Creation")
    print("="*60 + "\n")
    
    # Import here after path is set
    from app.db.database import SessionLocal
    
    db: Session = SessionLocal()
    
    try:
        # First, check if admin_users table exists
        result = db.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'admin_users'
            );
        """))
        table_exists = result.scalar()
        
        if not table_exists:
            print("⚠️  Admin tables do not exist yet!")
            print("\nPlease run the admin database migrations first:")
            print("  cd admin/backend")
            print("  alembic upgrade head")
            return
        
        # Check if super admin already exists
        result = db.execute(text("""
            SELECT COUNT(*) FROM admin_users WHERE role = 'super_admin';
        """))
        super_admin_count = result.scalar()
        
        if super_admin_count > 0:
            print(f"⚠️  {super_admin_count} Super admin(s) already exist in the system!")
            response = input("\nDo you want to create another super admin? (yes/no): ")
            if response.lower() not in ['yes', 'y']:
                print("Aborted.")
                return
            print()
        
        # Get admin details
        print("Enter Super Admin Details:")
        print("-" * 60 + "\n")
        
        # Email
        while True:
            email = input("📧 Email address: ").strip()
            if not email:
                print("❌ Email is required\n")
                continue
            
            if not validate_email(email):
                print("❌ Invalid email format\n")
                continue
            
            # Check if email already exists
            result = db.execute(
                text("SELECT COUNT(*) FROM admin_users WHERE email = :email"),
                {"email": email}
            )
            if result.scalar() > 0:
                print("❌ This email already exists\n")
                continue
            
            break
        
        # Full Name
        while True:
            full_name = input("👤 Full name: ").strip()
            if not full_name:
                print("❌ Full name is required\n")
                continue
            break
        
        # Password
        print("\n🔒 Password Requirements:")
        print("  • Minimum 12 characters")
        print("  • Must include: uppercase, lowercase, number, special character")
        print("  • Cannot be a common password\n")
        
        while True:
            password = getpass("Password: ")
            
            is_valid, error_msg = validate_password(password)
            if not is_valid:
                print(f"❌ {error_msg}\n")
                continue
            
            password_confirm = getpass("Confirm password: ")
            if password != password_confirm:
                print("❌ Passwords don't match\n")
                continue
            
            break
        
        # Hash password
        print("\n⏳ Creating super admin account...")
        password_hash = hash_password(password)
        
        # Insert admin user
        result = db.execute(
            text("""
                INSERT INTO admin_users (
                    email, password_hash, full_name, role, 
                    is_active, mfa_enabled, created_at, updated_at
                )
                VALUES (
                    :email, :password_hash, :full_name, 'super_admin',
                    TRUE, FALSE, NOW(), NOW()
                )
                RETURNING admin_id;
            """),
            {
                "email": email,
                "password_hash": password_hash,
                "full_name": full_name
            }
        )
        admin_id = result.scalar()
        
        # Log the creation in audit log
        db.execute(
            text("""
                INSERT INTO admin_audit_log (
                    admin_id, action, resource_type, 
                    ip_address, timestamp, details
                )
                VALUES (
                    :admin_id, 'SUPER_ADMIN_CREATED', 'admin_user',
                    '127.0.0.1', NOW(), :details
                );
            """),
            {
                "admin_id": admin_id,
                "details": f'{{"method": "cli_script", "email": "{email}"}}'
            }
        )
        
        db.commit()
        
        print("\n" + "="*60)
        print("✅ Super admin created successfully!")
        print("="*60)
        print(f"\nAdmin Details:")
        print(f"  Admin ID: {admin_id}")
        print(f"  Email: {email}")
        print(f"  Name: {full_name}")
        print(f"  Role: super_admin")
        print(f"  MFA Enabled: No (must be set up on first login)")
        
        print("\n⚠️  IMPORTANT NEXT STEPS:")
        print("  1. Save your credentials securely in a password manager")
        print("  2. On first login, you will be required to set up MFA")
        print("  3. Create additional admin accounts from the admin panel")
        print("  4. Do not run this script again in production")
        print("  5. Consider enabling IP whitelisting for admin access")
        
        print("\n🌐 Admin Panel URL:")
        print(f"  Development: http://localhost:8001/admin")
        print(f"  Production: https://admin.medilink.com")
        
        print("\n" + "="*60 + "\n")
        
    except Exception as e:
        print(f"\n❌ Error creating super admin: {e}")
        db.rollback()
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    try:
        create_super_admin()
    except KeyboardInterrupt:
        print("\n\n⚠️  Operation cancelled by user")
        sys.exit(0)

