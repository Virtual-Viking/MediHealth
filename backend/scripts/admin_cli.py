#!/usr/bin/env python3
"""
MediLink Admin Panel - CLI Management Tool

Commands:
    create-super-admin      Create a super admin account
    create-admin           Create a regular admin account
    list-admins            List all admin accounts
    deactivate-admin       Deactivate an admin account
    activate-admin         Activate an admin account
    reset-password         Reset admin password
    enable-mfa             Enable MFA for an admin
    disable-mfa            Disable MFA for an admin (requires super admin)
    show-audit-log         Show recent audit log entries

Usage:
    python backend/scripts/admin_cli.py <command> [options]
"""

import os
import sys
import argparse
from getpass import getpass
from pathlib import Path
from datetime import datetime, timedelta
from tabulate import tabulate

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from sqlalchemy import text
import bcrypt


def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def validate_password(password: str) -> tuple[bool, str]:
    """Validate password strength"""
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
    return True, ""


def create_super_admin(db: Session):
    """Create super admin account"""
    print("\n🔐 Create Super Admin Account\n")
    
    email = input("Email: ").strip()
    full_name = input("Full name: ").strip()
    
    # Check if exists
    result = db.execute(
        text("SELECT COUNT(*) FROM admin_users WHERE email = :email"),
        {"email": email}
    )
    if result.scalar() > 0:
        print("❌ Email already exists")
        return
    
    while True:
        password = getpass("Password: ")
        is_valid, error = validate_password(password)
        if not is_valid:
            print(f"❌ {error}")
            continue
        
        confirm = getpass("Confirm password: ")
        if password != confirm:
            print("❌ Passwords don't match")
            continue
        break
    
    password_hash = hash_password(password)
    
    result = db.execute(
        text("""
            INSERT INTO admin_users (email, password_hash, full_name, role, is_active, mfa_enabled, created_at)
            VALUES (:email, :password_hash, :full_name, 'super_admin', TRUE, FALSE, NOW())
            RETURNING admin_id;
        """),
        {"email": email, "password_hash": password_hash, "full_name": full_name}
    )
    admin_id = result.scalar()
    db.commit()
    
    print(f"\n✅ Super admin created (ID: {admin_id})")


def create_admin(db: Session, role: str):
    """Create regular admin account"""
    valid_roles = ['operations_admin', 'finance_admin', 'support_admin', 'technical_admin']
    
    if role not in valid_roles:
        print(f"❌ Invalid role. Must be one of: {', '.join(valid_roles)}")
        return
    
    print(f"\n👤 Create {role.replace('_', ' ').title()}\n")
    
    email = input("Email: ").strip()
    full_name = input("Full name: ").strip()
    
    # Check if exists
    result = db.execute(
        text("SELECT COUNT(*) FROM admin_users WHERE email = :email"),
        {"email": email}
    )
    if result.scalar() > 0:
        print("❌ Email already exists")
        return
    
    while True:
        password = getpass("Password: ")
        is_valid, error = validate_password(password)
        if not is_valid:
            print(f"❌ {error}")
            continue
        
        confirm = getpass("Confirm password: ")
        if password != confirm:
            print("❌ Passwords don't match")
            continue
        break
    
    password_hash = hash_password(password)
    
    result = db.execute(
        text("""
            INSERT INTO admin_users (email, password_hash, full_name, role, is_active, mfa_enabled, created_at)
            VALUES (:email, :password_hash, :full_name, :role, TRUE, FALSE, NOW())
            RETURNING admin_id;
        """),
        {"email": email, "password_hash": password_hash, "full_name": full_name, "role": role}
    )
    admin_id = result.scalar()
    db.commit()
    
    print(f"\n✅ Admin created (ID: {admin_id})")


def list_admins(db: Session):
    """List all admin accounts"""
    result = db.execute(text("""
        SELECT 
            admin_id,
            email,
            full_name,
            role,
            is_active,
            mfa_enabled,
            last_login,
            created_at
        FROM admin_users
        ORDER BY created_at DESC;
    """))
    
    admins = []
    for row in result:
        admins.append([
            row[0],  # admin_id
            row[1],  # email
            row[2],  # full_name
            row[3].replace('_', ' ').title() if row[3] else '',  # role
            "✓" if row[4] else "✗",  # is_active
            "✓" if row[5] else "✗",  # mfa_enabled
            row[6].strftime("%Y-%m-%d %H:%M") if row[6] else "Never",  # last_login
            row[7].strftime("%Y-%m-%d") if row[7] else ""  # created_at
        ])
    
    if not admins:
        print("\n⚠️  No admin accounts found")
        return
    
    print(f"\n📋 Admin Accounts ({len(admins)} total)\n")
    print(tabulate(
        admins,
        headers=["ID", "Email", "Name", "Role", "Active", "MFA", "Last Login", "Created"],
        tablefmt="grid"
    ))
    print()


def deactivate_admin(db: Session, email: str):
    """Deactivate admin account"""
    result = db.execute(
        text("UPDATE admin_users SET is_active = FALSE WHERE email = :email RETURNING admin_id;"),
        {"email": email}
    )
    admin_id = result.scalar()
    
    if admin_id:
        db.commit()
        print(f"✅ Admin {email} deactivated")
    else:
        print(f"❌ Admin {email} not found")


def activate_admin(db: Session, email: str):
    """Activate admin account"""
    result = db.execute(
        text("UPDATE admin_users SET is_active = TRUE WHERE email = :email RETURNING admin_id;"),
        {"email": email}
    )
    admin_id = result.scalar()
    
    if admin_id:
        db.commit()
        print(f"✅ Admin {email} activated")
    else:
        print(f"❌ Admin {email} not found")


def reset_password(db: Session, email: str):
    """Reset admin password"""
    # Check if admin exists
    result = db.execute(
        text("SELECT admin_id FROM admin_users WHERE email = :email;"),
        {"email": email}
    )
    admin_id = result.scalar()
    
    if not admin_id:
        print(f"❌ Admin {email} not found")
        return
    
    print(f"\n🔒 Reset Password for {email}\n")
    
    while True:
        password = getpass("New password: ")
        is_valid, error = validate_password(password)
        if not is_valid:
            print(f"❌ {error}")
            continue
        
        confirm = getpass("Confirm password: ")
        if password != confirm:
            print("❌ Passwords don't match")
            continue
        break
    
    password_hash = hash_password(password)
    
    db.execute(
        text("""
            UPDATE admin_users 
            SET password_hash = :password_hash, 
                password_changed_at = NOW(),
                failed_login_attempts = 0,
                locked_until = NULL
            WHERE email = :email;
        """),
        {"password_hash": password_hash, "email": email}
    )
    db.commit()
    
    print(f"\n✅ Password reset successfully for {email}")


def show_audit_log(db: Session, limit: int = 20):
    """Show recent audit log entries"""
    result = db.execute(text("""
        SELECT 
            al.timestamp,
            au.email,
            al.action,
            al.resource_type,
            al.ip_address
        FROM admin_audit_log al
        LEFT JOIN admin_users au ON al.admin_id = au.admin_id
        ORDER BY al.timestamp DESC
        LIMIT :limit;
    """), {"limit": limit})
    
    logs = []
    for row in result:
        logs.append([
            row[0].strftime("%Y-%m-%d %H:%M:%S") if row[0] else "",
            row[1] or "System",
            row[2],
            row[3] or "",
            row[4] or ""
        ])
    
    if not logs:
        print("\n⚠️  No audit log entries found")
        return
    
    print(f"\n📜 Recent Audit Log ({len(logs)} entries)\n")
    print(tabulate(
        logs,
        headers=["Timestamp", "Admin", "Action", "Resource", "IP Address"],
        tablefmt="grid"
    ))
    print()


def main():
    parser = argparse.ArgumentParser(description="MediLink Admin CLI Management Tool")
    parser.add_argument("command", choices=[
        "create-super-admin",
        "create-admin",
        "list-admins",
        "deactivate-admin",
        "activate-admin",
        "reset-password",
        "show-audit-log"
    ], help="Command to execute")
    parser.add_argument("--email", help="Admin email address")
    parser.add_argument("--role", help="Admin role (for create-admin)")
    parser.add_argument("--limit", type=int, default=20, help="Limit for audit log")
    
    args = parser.parse_args()
    
    # Import database after path setup
    from app.db.database import SessionLocal
    
    db: Session = SessionLocal()
    
    try:
        if args.command == "create-super-admin":
            create_super_admin(db)
        
        elif args.command == "create-admin":
            if not args.role:
                print("❌ --role is required")
                return
            create_admin(db, args.role)
        
        elif args.command == "list-admins":
            list_admins(db)
        
        elif args.command == "deactivate-admin":
            if not args.email:
                print("❌ --email is required")
                return
            deactivate_admin(db, args.email)
        
        elif args.command == "activate-admin":
            if not args.email:
                print("❌ --email is required")
                return
            activate_admin(db, args.email)
        
        elif args.command == "reset-password":
            if not args.email:
                print("❌ --email is required")
                return
            reset_password(db, args.email)
        
        elif args.command == "show-audit-log":
            show_audit_log(db, args.limit)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Operation cancelled")
        sys.exit(0)

