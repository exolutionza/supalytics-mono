import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Twitter,
  Github,
  Linkedin,
  Mail,
  MessageSquare,
  BookOpen,
  ShieldCheck,
  HeartHandshake
} from 'lucide-react';

const Footer = () => {
  const footerLinks = {
    Product: [
      { label: 'Features', href: '#' },
      { label: 'Pricing', href: '#' },
      { label: 'Documentation', href: '#' },
      { label: 'API Reference', href: '#' },
    ],
    Company: [
      { label: 'About', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Careers', href: '#' },
      { label: 'Contact', href: '#' },
    ],
    Legal: [
      { label: 'Privacy', href: '#' },
      { label: 'Terms', href: '#' },
      { label: 'Security', href: '#' },
      { label: 'Status', href: '#' },
    ],
    Resources: [
      { label: 'Documentation', href: '#' },
      { label: 'Guides', href: '#' },
      { label: 'Support', href: '#' },
      { label: 'API Status', href: '#' },
    ],
  };

  const socialLinks = [
    { icon: Twitter, href: '#', label: 'Twitter' },
    { icon: Github, href: '#', label: 'GitHub' },
    { icon: Linkedin, href: '#', label: 'LinkedIn' },
    { icon: Mail, href: '#', label: 'Email' },
  ];

  const features = [
    { icon: MessageSquare, text: '24/7 Support' },
    { icon: BookOpen, text: 'Detailed Docs' },
    { icon: ShieldCheck, text: 'Enterprise Security' },
    { icon: HeartHandshake, text: '99.9% Uptime SLA' },
  ];

  return (
    <footer className="bg-black border-t border-gray-800">
      {/* Upper Footer */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-12">
          {/* Newsletter Section */}
          <div>
            <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent mb-4">
              Stay Updated
            </h3>
            <p className="text-gray-400 mb-6 max-w-md">
              Get the latest updates on product features, analytics trends, and industry insights delivered to your inbox.
            </p>
            <div className="flex gap-3">
              <Input 
                type="email" 
                placeholder="Enter your email" 
                className="bg-gray-900 border-gray-800 text-gray-300 placeholder:text-gray-500"
              />
              <Button className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap">
                Subscribe
              </Button>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-2 gap-6">
            {features.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-800">
                <div className="p-2 bg-blue-900/30 rounded-lg">
                  <Icon className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-gray-300">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Links Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-12 border-t border-gray-800">
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="font-semibold text-white mb-4">{title}</h4>
              <ul className="space-y-3">
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <a 
                      href={href}
                      className="text-gray-400 hover:text-white transition-colors duration-200"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="border-t border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <img src="/icon.svg" alt="Logo" className="h-6 w-6" />
              <span className="text-sm text-gray-400">
                © 2025 Statlas. All rights reserved.
              </span>
            </div>
            
            {/* Social Links */}
            <div className="flex gap-4">
              {socialLinks.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  className="text-gray-400 hover:text-white transition-colors duration-200"
                  aria-label={label}
                >
                  <Icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;