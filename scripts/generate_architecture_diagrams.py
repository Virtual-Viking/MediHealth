#!/usr/bin/env python3
"""
Script to generate and validate architecture diagrams for MediHealth.

This script can:
1. Extract database schema information
2. Generate Mermaid diagrams from code analysis
3. Validate existing diagrams
4. Generate component lists from codebase
"""

import os
import sys
import ast
import re
from pathlib import Path
from typing import Dict, List, Set, Tuple
from collections import defaultdict

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

def extract_routers() -> List[Dict[str, str]]:
    """Extract router information from backend/app/routers."""
    routers = []
    routers_dir = Path(__file__).parent.parent / "backend" / "app" / "routers"
    
    for router_file in routers_dir.glob("*.py"):
        if router_file.name == "__init__.py":
            continue
        
        try:
            with open(router_file, 'r') as f:
                content = f.read()
                
            # Extract router prefix
            prefix_match = re.search(r'prefix=["\']([^"\']+)["\']', content)
            prefix = prefix_match.group(1) if prefix_match else ""
            
            # Extract tags
            tags_match = re.search(r'tags=\[([^\]]+)\]', content)
            tags = tags_match.group(1) if tags_match else ""
            
            routers.append({
                "name": router_file.stem,
                "file": router_file.name,
                "prefix": prefix,
                "tags": tags
            })
        except Exception as e:
            print(f"Error processing {router_file}: {e}")
    
    return routers

def extract_services() -> List[str]:
    """Extract service names from backend/app/services."""
    services_dir = Path(__file__).parent.parent / "backend" / "app" / "services"
    services = []
    
    for service_file in services_dir.glob("*.py"):
        if service_file.name == "__init__.py":
            continue
        
        services.append(service_file.stem)
    
    return services

def extract_models() -> List[Dict[str, str]]:
    """Extract model information from backend/app/db/models."""
    models = []
    models_dir = Path(__file__).parent.parent / "backend" / "app" / "db" / "models"
    
    for model_file in models_dir.glob("*.py"):
        if model_file.name == "__init__.py":
            continue
        
        try:
            with open(model_file, 'r') as f:
                content = f.read()
                tree = ast.parse(content)
                
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    # Check if it's a SQLAlchemy model (inherits from Base)
                    for base in node.bases:
                        if isinstance(base, ast.Name) and base.id == "Base":
                            # Extract table name
                            table_name = None
                            for item in node.body:
                                if isinstance(item, ast.Assign):
                                    for target in item.targets:
                                        if isinstance(target, ast.Name) and target.id == "__tablename__":
                                            if isinstance(item.value, ast.Constant):
                                                table_name = item.value.value
                            
                            models.append({
                                "class": node.name,
                                "file": model_file.name,
                                "table": table_name or node.name.lower()
                            })
                            break
        except Exception as e:
            print(f"Error processing {model_file}: {e}")
    
    return models

def extract_frontend_pages() -> List[str]:
    """Extract page routes from frontend."""
    pages = []
    pages_dir = Path(__file__).parent.parent / "frontend" / "src" / "app"
    
    if pages_dir.exists():
        for page_file in pages_dir.rglob("page.tsx"):
            # Get relative path from app directory
            rel_path = page_file.relative_to(pages_dir.parent)
            route = "/" + str(rel_path.parent).replace("\\", "/")
            if route == "/.":
                route = "/"
            pages.append(route)
    
    return sorted(pages)

def generate_component_list() -> str:
    """Generate a markdown list of all components."""
    routers = extract_routers()
    services = extract_services()
    models = extract_models()
    pages = extract_frontend_pages()
    
    output = "# MediHealth Component Inventory\n\n"
    output += "Generated automatically from codebase analysis.\n\n"
    
    output += "## Backend Routers\n\n"
    for router in routers:
        output += f"- **{router['name']}**: `{router['prefix']}`\n"
    
    output += "\n## Backend Services\n\n"
    for service in sorted(services):
        output += f"- `{service}`\n"
    
    output += "\n## Database Models\n\n"
    for model in models:
        output += f"- `{model['class']}` → `{model['table']}`\n"
    
    output += "\n## Frontend Pages\n\n"
    for page in pages:
        output += f"- `{page}`\n"
    
    return output

def validate_mermaid_syntax(file_path: Path) -> Tuple[bool, List[str]]:
    """Basic validation of Mermaid syntax in a file."""
    errors = []
    
    if not file_path.exists():
        return False, [f"File not found: {file_path}"]
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Check for mermaid code blocks
    mermaid_blocks = re.findall(r'```mermaid\n(.*?)```', content, re.DOTALL)
    
    if not mermaid_blocks:
        errors.append("No Mermaid code blocks found")
        return False, errors
    
    # Basic syntax checks
    for i, block in enumerate(mermaid_blocks):
        if not block.strip():
            errors.append(f"Empty Mermaid block #{i+1}")
        if not any(keyword in block for keyword in ['graph', 'sequenceDiagram', 'erDiagram', 'classDiagram']):
            errors.append(f"Mermaid block #{i+1} missing diagram type declaration")
    
    return len(errors) == 0, errors

def main():
    """Main function."""
    project_root = Path(__file__).parent.parent
    
    print("🔍 Analyzing MediHealth codebase...")
    
    # Generate component inventory
    inventory = generate_component_list()
    inventory_path = project_root / "COMPONENT_INVENTORY.md"
    with open(inventory_path, 'w') as f:
        f.write(inventory)
    print(f"✅ Generated component inventory: {inventory_path}")
    
    # Validate architecture diagrams
    diagrams_path = project_root / "architecture_diagrams.md"
    if diagrams_path.exists():
        is_valid, errors = validate_mermaid_syntax(diagrams_path)
        if is_valid:
            print(f"✅ Architecture diagrams syntax is valid")
        else:
            print(f"⚠️  Architecture diagrams have issues:")
            for error in errors:
                print(f"   - {error}")
    else:
        print(f"⚠️  Architecture diagrams file not found: {diagrams_path}")
    
    # Print summary
    print("\n📊 Summary:")
    print(f"   - Routers: {len(extract_routers())}")
    print(f"   - Services: {len(extract_services())}")
    print(f"   - Models: {len(extract_models())}")
    print(f"   - Frontend Pages: {len(extract_frontend_pages())}")
    
    print("\n💡 Tips:")
    print("   - View diagrams at: https://mermaid.live")
    print("   - Use VS Code extension: 'Markdown Preview Mermaid Support'")
    print("   - GitHub/GitLab render Mermaid diagrams natively in markdown")

if __name__ == "__main__":
    main()

