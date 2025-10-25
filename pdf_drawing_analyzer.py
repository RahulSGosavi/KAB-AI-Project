"""
AI-Powered Engineering Drawing Analyzer
Extracts and understands cabinet layouts, dimensions, and spatial relationships from PDF drawings
"""

import re
import fitz  # PyMuPDF
from collections import defaultdict
from typing import List, Dict, Tuple, Optional

class DrawingElement:
    """Represents a single element extracted from a drawing"""
    def __init__(self, text: str, bbox: Tuple[float, float, float, float], page: int, element_type: str = 'unknown'):
        self.text = text
        self.bbox = bbox  # (x0, y0, x1, y1)
        self.page = page
        self.element_type = element_type  # 'sku', 'dimension', 'label', 'room', etc.
        self.center_x = (bbox[0] + bbox[2]) / 2
        self.center_y = (bbox[1] + bbox[3]) / 2
    
    def distance_to(self, other: 'DrawingElement') -> float:
        """Calculate distance to another element"""
        dx = self.center_x - other.center_x
        dy = self.center_y - other.center_y
        return (dx**2 + dy**2) ** 0.5
    
    def is_near(self, other: 'DrawingElement', threshold: float = 100) -> bool:
        """Check if this element is near another element"""
        return self.distance_to(other) < threshold
    
    def to_dict(self):
        return {
            'text': self.text,
            'bbox': self.bbox,
            'page': self.page,
            'type': self.element_type,
            'position': {'x': self.center_x, 'y': self.center_y}
        }


class PDFDrawingAnalyzer:
    """Intelligent PDF Drawing Analyzer"""
    
    # Precise SKU patterns for cabinet codes - only matches actual SKU codes
    SKU_PATTERN = r'\b([WBSPFRLD][A-Z]*\d{2,4}(?:\s+(?:X\s+\d{2}\s+DP|BUTT?|[LR]|\d+TD))*|SB\d{2}(?:\s+BUTT)?)\b'
    
    # Dimension patterns (e.g., 108", 31 1/2", 2'-6")
    DIMENSION_PATTERN = r'(\d+(?:\s*\d+/\d+)?(?:"|\'|mm|cm|ft|\s*1/[248]))'
    
    # Room/zone patterns
    ROOM_PATTERN = r'(EL(?:EVATION)?\s*\d+|KITCHEN|GARAGE|BEDROOM|BATHROOM|LIVING|DINING)'
    
    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.doc = None
        self.elements: List[DrawingElement] = []
        self.skus: List[DrawingElement] = []
        self.dimensions: List[DrawingElement] = []
        self.rooms: List[DrawingElement] = []
        self.sku_counts: Dict[str, int] = defaultdict(int)
        self.sku_locations: Dict[str, List[DrawingElement]] = defaultdict(list)
        
    def analyze(self) -> Dict:
        """Main analysis method - extracts and understands drawing"""
        try:
            self.doc = fitz.open(self.pdf_path)
            self._extract_all_elements()
            self._classify_elements()
            self._build_relationships()
            self._count_skus()
            
            return self._generate_analysis_report()
        finally:
            if self.doc:
                self.doc.close()
    
    def _extract_all_elements(self):
        """Extract all text elements with positions"""
        for page_num in range(len(self.doc)):
            page = self.doc[page_num]
            
            # Extract text blocks with positions
            blocks = page.get_text("blocks")
            for block in blocks:
                x0, y0, x1, y1, text, block_no, block_type = block
                text = text.strip()
                
                if text and len(text) > 0:
                    element = DrawingElement(
                        text=text,
                        bbox=(x0, y0, x1, y1),
                        page=page_num + 1
                    )
                    self.elements.append(element)
    
    def _classify_elements(self):
        """Classify elements as SKUs, dimensions, rooms, etc."""
        for element in self.elements:
            text = element.text.upper()
            
            # Check if it's a SKU
            if re.search(self.SKU_PATTERN, text, re.IGNORECASE):
                element.element_type = 'sku'
                self.skus.append(element)
            
            # Check if it's a dimension
            elif re.search(self.DIMENSION_PATTERN, text):
                element.element_type = 'dimension'
                self.dimensions.append(element)
            
            # Check if it's a room/zone label
            elif re.search(self.ROOM_PATTERN, text, re.IGNORECASE):
                element.element_type = 'room'
                self.rooms.append(element)
    
    def _build_relationships(self):
        """Build spatial relationships between elements"""
        for sku in self.skus:
            # Find nearby dimensions
            nearby_dims = [d for d in self.dimensions if sku.is_near(d, threshold=150)]
            sku.nearby_dimensions = nearby_dims
            
            # Find nearest room/zone
            if self.rooms:
                nearest_room = min(self.rooms, key=lambda r: sku.distance_to(r))
                if sku.distance_to(nearest_room) < 300:  # Within reasonable distance
                    sku.room = nearest_room.text
                else:
                    sku.room = "Unknown"
            else:
                sku.room = "Unknown"
            
            # Find nearby SKUs (adjacent cabinets)
            nearby_skus = [s for s in self.skus if s != sku and sku.is_near(s, threshold=120)]
            sku.adjacent_to = [s.text for s in nearby_skus[:3]]  # Top 3 nearest
    
    def _count_skus(self):
        """Count occurrences of each SKU"""
        for sku in self.skus:
            # Extract the actual SKU code
            match = re.search(self.SKU_PATTERN, sku.text, re.IGNORECASE)
            if match:
                sku_code = match.group(1).upper()
                self.sku_counts[sku_code] += 1
                self.sku_locations[sku_code].append(sku)
    
    def _generate_analysis_report(self) -> Dict:
        """Generate comprehensive analysis report"""
        return {
            'file_type': 'engineering_drawing',
            'total_pages': len(self.doc),
            'total_elements': len(self.elements),
            'skus_found': len(self.skus),
            'unique_skus': len(self.sku_counts),
            'dimensions_found': len(self.dimensions),
            'rooms_found': len(self.rooms),
            'sku_list': list(self.sku_counts.keys()),
            'sku_counts': dict(self.sku_counts),
            'sku_details': [self._format_sku_detail(sku) for sku in self.skus],
            'summary': self._generate_summary()
        }
    
    def _format_sku_detail(self, sku: DrawingElement) -> Dict:
        """Format detailed information about a SKU"""
        match = re.search(self.SKU_PATTERN, sku.text, re.IGNORECASE)
        sku_code = match.group(1).upper() if match else sku.text
        
        return {
            'sku': sku_code,
            'page': sku.page,
            'location': getattr(sku, 'room', 'Unknown'),
            'position': {'x': sku.center_x, 'y': sku.center_y},
            'nearby_dimensions': [d.text for d in getattr(sku, 'nearby_dimensions', [])[:3]],
            'adjacent_to': getattr(sku, 'adjacent_to', [])
        }
    
    def _generate_summary(self) -> str:
        """Generate human-readable summary"""
        summary_parts = []
        
        if self.skus:
            summary_parts.append(f"📐 Engineering Drawing Analysis")
            summary_parts.append(f"\n✅ Found {len(self.skus)} cabinet codes ({len(self.sku_counts)} unique types)")
            
            # Most common SKUs
            top_skus = sorted(self.sku_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            if top_skus:
                summary_parts.append(f"\n🔝 Most Common SKUs:")
                for sku, count in top_skus:
                    summary_parts.append(f"  • {sku}: {count}x")
            
            # Rooms/zones detected
            if self.rooms:
                unique_rooms = set(r.text for r in self.rooms)
                summary_parts.append(f"\n📍 Zones: {', '.join(sorted(unique_rooms))}")
            
            summary_parts.append(f"\n💡 You can ask:")
            summary_parts.append(f"  • 'How many W3630 BUTT cabinets?'")
            summary_parts.append(f"  • 'Where is B36 1TD BUTT located?'")
            summary_parts.append(f"  • 'List all cabinets in Elevation 2'")
        else:
            summary_parts.append("⚠️ No cabinet codes detected in this drawing.")
        
        return '\n'.join(summary_parts)
    
    def answer_question(self, question: str) -> str:
        """Answer intelligent questions about the drawing"""
        q = question.lower()
        
        # Count questions
        if any(word in q for word in ['how many', 'count', 'number of']):
            return self._answer_count_question(question)
        
        # Location questions
        elif any(word in q for word in ['where', 'location', 'find', 'position']):
            return self._answer_location_question(question)
        
        # List questions
        elif any(word in q for word in ['list', 'show all', 'what are']):
            return self._answer_list_question(question)
        
        # Dimension questions
        elif any(word in q for word in ['dimension', 'size', 'measurement']):
            return self._answer_dimension_question(question)
        
        else:
            return self._general_answer(question)
    
    def _answer_count_question(self, question: str) -> str:
        """Answer 'how many' type questions"""
        # Extract SKU from question
        match = re.search(self.SKU_PATTERN, question, re.IGNORECASE)
        if match:
            sku_code = match.group(1).upper()
            count = self.sku_counts.get(sku_code, 0)
            
            if count > 0:
                locations = self.sku_locations[sku_code]
                rooms = set(getattr(loc, 'room', 'Unknown') for loc in locations)
                
                response = f"📊 **{sku_code}**: Found **{count}** instance{'s' if count > 1 else ''}"
                if rooms and rooms != {'Unknown'}:
                    response += f"\n📍 Locations: {', '.join(sorted(rooms))}"
                
                return response
            else:
                # Suggest similar SKUs
                similar = [s for s in self.sku_counts.keys() if s[:2] == sku_code[:2]][:5]
                if similar:
                    return f"❌ {sku_code} not found.\n\n💡 Similar SKUs: {', '.join(similar)}"
                else:
                    return f"❌ {sku_code} not found in this drawing."
        
        return f"❓ Please specify which SKU you're asking about.\n\nAvailable: {', '.join(list(self.sku_counts.keys())[:10])}"
    
    def _answer_location_question(self, question: str) -> str:
        """Answer 'where is' type questions"""
        match = re.search(self.SKU_PATTERN, question, re.IGNORECASE)
        if match:
            sku_code = match.group(1).upper()
            locations = self.sku_locations.get(sku_code, [])
            
            if locations:
                response = f"📍 **{sku_code}** found in {len(locations)} location{'s' if len(locations) > 1 else ''}:\n\n"
                
                for i, loc in enumerate(locations, 1):
                    room = getattr(loc, 'room', 'Unknown')
                    response += f"{i}. **{room}** (Page {loc.page})"
                    
                    # Add nearby dimensions
                    dims = getattr(loc, 'nearby_dimensions', [])
                    if dims:
                        dim_texts = [d.text for d in dims[:2]]
                        response += f"\n   Dimensions nearby: {', '.join(dim_texts)}"
                    
                    # Add adjacent cabinets
                    adjacent = getattr(loc, 'adjacent_to', [])
                    if adjacent:
                        response += f"\n   Adjacent to: {', '.join(adjacent[:2])}"
                    
                    response += "\n"
                
                return response.strip()
            else:
                return f"❌ {sku_code} not found in this drawing."
        
        return "❓ Please specify which SKU you're looking for."
    
    def _answer_list_question(self, question: str) -> str:
        """Answer 'list all' type questions"""
        # Check if asking about a specific room
        room_match = re.search(self.ROOM_PATTERN, question, re.IGNORECASE)
        
        if room_match:
            room_name = room_match.group(1).upper()
            room_skus = [s for s in self.skus if getattr(s, 'room', '').upper() == room_name]
            
            if room_skus:
                sku_list = [re.search(self.SKU_PATTERN, s.text, re.IGNORECASE).group(1) for s in room_skus]
                return f"📋 Cabinets in **{room_name}**:\n\n" + '\n'.join(f"• {sku}" for sku in sku_list)
            else:
                return f"❌ No cabinets found in {room_name}"
        
        # List all SKUs
        if self.sku_counts:
            response = f"📋 **All Cabinet SKUs** ({len(self.sku_counts)} unique types):\n\n"
            for sku, count in sorted(self.sku_counts.items()):
                response += f"• **{sku}**: {count}x\n"
            return response
        else:
            return "❌ No SKUs found in this drawing."
    
    def _answer_dimension_question(self, question: str) -> str:
        """Answer dimension-related questions"""
        if self.dimensions:
            return f"📏 **Dimensions Found**: {len(self.dimensions)}\n\nSample measurements:\n" + '\n'.join(f"• {d.text}" for d in self.dimensions[:10])
        else:
            return "❌ No dimensions detected in this drawing."
    
    def _general_answer(self, question: str) -> str:
        """General fallback answer"""
        return self._generate_summary()


def analyze_pdf_drawing(pdf_path: str) -> Dict:
    """Main entry point for PDF drawing analysis"""
    analyzer = PDFDrawingAnalyzer(pdf_path)
    return analyzer.analyze()


def answer_drawing_question(pdf_path: str, question: str) -> str:
    """Answer questions about a PDF drawing"""
    analyzer = PDFDrawingAnalyzer(pdf_path)
    analyzer.analyze()
    return analyzer.answer_question(question)

