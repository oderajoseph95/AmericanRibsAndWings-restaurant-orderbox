import { Link } from "react-router-dom";
import { Facebook, Instagram, Mail, Phone, MapPin } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-foreground text-background">
      <div className="container px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <h3 className="text-2xl font-bold mb-4">
              American Ribs
              <span className="text-accent"> & Wings</span>
            </h3>
            <p className="text-background/70 mb-4">
              Authentic American BBQ crafted with passion. Smoky ribs, crispy wings, 
              and flavors that'll make you come back for more.
            </p>
            <div className="flex gap-3">
              <a 
                href="#" 
                className="w-10 h-10 bg-background/10 rounded-full flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a 
                href="#" 
                className="w-10 h-10 bg-background/10 rounded-full flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-lg mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <a href="#menu" className="text-background/70 hover:text-accent transition-colors">
                  Our Menu
                </a>
              </li>
              <li>
                <Link to="/order" className="text-background/70 hover:text-accent transition-colors">
                  Order Online
                </Link>
              </li>
              <li>
                <a href="#" className="text-background/70 hover:text-accent transition-colors">
                  About Us
                </a>
              </li>
              <li>
                <a href="#" className="text-background/70 hover:text-accent transition-colors">
                  Contact
                </a>
              </li>
            </ul>
          </div>

          {/* Hours */}
          <div>
            <h4 className="font-semibold text-lg mb-4">Hours</h4>
            <ul className="space-y-2 text-background/70">
              <li className="flex justify-between">
                <span>Mon - Fri</span>
                <span>10AM - 10PM</span>
              </li>
              <li className="flex justify-between">
                <span>Saturday</span>
                <span>9AM - 11PM</span>
              </li>
              <li className="flex justify-between">
                <span>Sunday</span>
                <span>9AM - 9PM</span>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-lg mb-4">Contact</h4>
            <ul className="space-y-3 text-background/70">
              <li className="flex items-start gap-2">
                <MapPin className="h-5 w-5 mt-0.5 shrink-0" />
                <span>123 Main Street, Barangay Centro, City, Province 1234</span>
              </li>
              <li>
                <a 
                  href="tel:+639123456789" 
                  className="flex items-center gap-2 hover:text-accent transition-colors"
                >
                  <Phone className="h-5 w-5" />
                  (0912) 345-6789
                </a>
              </li>
              <li>
                <a 
                  href="mailto:order@americanribsandwings.com" 
                  className="flex items-center gap-2 hover:text-accent transition-colors"
                >
                  <Mail className="h-5 w-5" />
                  order@americanribsandwings.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-background/10 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-background/50 text-sm">
            © {currentYear} American Ribs & Wings. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-background/50">
            <a href="#" className="hover:text-accent transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-accent transition-colors">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
